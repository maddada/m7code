import { useEffect } from "react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";

import {
  DraftId,
  type ComposerThreadDraftState,
  type DraftSessionState,
  useComposerDraftStore,
} from "../composerDraftStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readThreadDetail, readThreadShell } from "../state/entities";
import { threadEnvironment } from "../state/threads";
import { readCurrentGhostexT3EmbeddedLaunch, type GhostexT3EmbeddedLaunch } from "./embeddedLaunch";

const CLEANUP_REGISTRY_KEY = "t3code:ghostex-embedded-cleanup:v1";
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const CLEANUP_STARTUP_DELAY_MS = 60 * 1000;
const CLEANUP_GRACE_MS = 15 * 60 * 1000;

interface StoredGhostexT3CleanupCandidate extends GhostexT3EmbeddedLaunch {
  lastObservedAt: string;
  t3DeletedAt?: string;
}

type StoredGhostexT3CleanupRegistry = Record<string, StoredGhostexT3CleanupCandidate>;

const cleanupInFlightKeys = new Set<string>();

function normalizeGhostexIdentityComponent(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}

function stableGhostexDraftId(sessionId: string): DraftId {
  return DraftId.make(`ghostex-draft-${normalizeGhostexIdentityComponent(sessionId)}`);
}

function cleanupCandidateKey(
  launch: Pick<GhostexT3EmbeddedLaunch, "ghostexProjectId" | "ghostexSessionId">,
): string {
  return `${launch.ghostexProjectId}:${launch.ghostexSessionId}`;
}

function readCleanupRegistry(): StoredGhostexT3CleanupRegistry {
  if (typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(CLEANUP_REGISTRY_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as StoredGhostexT3CleanupRegistry;
  } catch {
    return {};
  }
}

function writeCleanupRegistry(registry: StoredGhostexT3CleanupRegistry): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(CLEANUP_REGISTRY_KEY, JSON.stringify(registry));
  } catch {}
}

function rememberCurrentGhostexT3CleanupCandidate(): GhostexT3EmbeddedLaunch | null {
  const launch = readCurrentGhostexT3EmbeddedLaunch();
  if (!launch?.isDraft) {
    return launch;
  }
  const key = cleanupCandidateKey(launch);
  const registry = readCleanupRegistry();
  registry[key] = {
    ...launch,
    lastObservedAt: new Date().toISOString(),
    ...(registry[key]?.t3DeletedAt ? { t3DeletedAt: registry[key].t3DeletedAt } : {}),
  };
  writeCleanupRegistry(registry);
  return launch;
}

function parseCandidateCreatedAt(candidate: StoredGhostexT3CleanupCandidate): number {
  const createdAt = Date.parse(candidate.createdAt ?? candidate.lastObservedAt);
  return Number.isFinite(createdAt) ? createdAt : Date.now();
}

function isCandidatePastCleanupGrace(
  candidate: StoredGhostexT3CleanupCandidate,
  now: number,
): boolean {
  return now - parseCandidateCreatedAt(candidate) >= CLEANUP_GRACE_MS;
}

function isSameCleanupCandidate(
  left: Pick<GhostexT3EmbeddedLaunch, "ghostexProjectId" | "ghostexSessionId"> | null,
  right: Pick<GhostexT3EmbeddedLaunch, "ghostexProjectId" | "ghostexSessionId">,
): boolean {
  return (
    left?.ghostexProjectId === right.ghostexProjectId &&
    left?.ghostexSessionId === right.ghostexSessionId
  );
}

function isDraftUserContentEmpty(draft: ComposerThreadDraftState | null): boolean {
  return (
    draft === null ||
    (draft.prompt.trim().length === 0 &&
      draft.images.length === 0 &&
      draft.nonPersistedImageIds.length === 0 &&
      draft.persistedAttachments.length === 0 &&
      draft.terminalContexts.length === 0 &&
      draft.elementContexts.length === 0 &&
      draft.previewAnnotations.length === 0 &&
      draft.reviewComments.length === 0)
  );
}

function isDraftSessionDefault(session: DraftSessionState | null): boolean {
  return (
    session === null ||
    (session.branch === null &&
      session.worktreePath === null &&
      session.envMode === "local" &&
      session.startFromOrigin === false &&
      session.promotedTo == null)
  );
}

function candidateThreadRef(candidate: StoredGhostexT3CleanupCandidate): ScopedThreadRef {
  return scopeThreadRef(
    EnvironmentId.make(candidate.environmentId),
    ThreadId.make(candidate.threadId),
  );
}

function hasServerThread(candidate: StoredGhostexT3CleanupCandidate): boolean {
  const threadRef = candidateThreadRef(candidate);
  return readThreadShell(threadRef) !== null || readThreadDetail(threadRef) !== null;
}

function canDeleteServerThread(candidate: StoredGhostexT3CleanupCandidate): boolean {
  const threadRef = candidateThreadRef(candidate);
  const detail = readThreadDetail(threadRef);
  if (!detail) {
    return false;
  }
  return (
    detail.messages.length === 0 &&
    detail.activities.length === 0 &&
    detail.proposedPlans.length === 0 &&
    detail.session === null &&
    isDraftUserContentEmpty(useComposerDraftStore.getState().getComposerDraft(threadRef))
  );
}

async function deleteEmptyServerThreadIfSafe(
  candidate: StoredGhostexT3CleanupCandidate,
): Promise<boolean> {
  if (!canDeleteServerThread(candidate)) {
    return false;
  }
  const threadRef = candidateThreadRef(candidate);
  const result = await runAtomCommand(
    appAtomRegistry,
    threadEnvironment.delete,
    {
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId },
    },
    {
      label: "ghostex t3 empty thread cleanup",
      reportDefect: false,
      reportFailure: false,
    },
  );
  if (result._tag !== "Success") {
    return false;
  }
  useComposerDraftStore.getState().clearComposerContent(threadRef);
  return true;
}

function deleteEmptyDraftIfSafe(candidate: StoredGhostexT3CleanupCandidate): boolean {
  const store = useComposerDraftStore.getState();
  const draftId = stableGhostexDraftId(candidate.ghostexSessionId);
  const draftSession = store.getDraftSession(draftId);
  const draft = store.getComposerDraft(draftId);
  if (hasServerThread(candidate)) {
    return false;
  }
  if (!isDraftSessionDefault(draftSession) || !isDraftUserContentEmpty(draft)) {
    return false;
  }
  store.clearDraftThread(draftId);
  return true;
}

async function deleteEmptyT3RecordIfSafe(
  candidate: StoredGhostexT3CleanupCandidate,
): Promise<boolean> {
  if (hasServerThread(candidate)) {
    return deleteEmptyServerThreadIfSafe(candidate);
  }
  return deleteEmptyDraftIfSafe(candidate);
}

function emitEmptySessionObserved(candidate: StoredGhostexT3CleanupCandidate): void {
  const event = {
    environmentId: candidate.environmentId,
    ghostexProjectId: candidate.ghostexProjectId,
    ghostexSessionId: candidate.ghostexSessionId,
    kind: "emptySessionObserved" as const,
    projectId: candidate.projectId,
    t3SidebarMode: candidate.t3SidebarMode,
    threadId: candidate.threadId,
  };
  try {
    window.postMessage({ event, type: "ghostexT3EmbeddedEvent" }, window.location.origin);
  } catch {}
  try {
    window.webkit?.messageHandlers?.ghostexT3CodePaneDiagnostics?.postMessage({
      event,
      type: "ghostex-embedded-event",
    });
  } catch {}
}

async function runCleanupPass(): Promise<void> {
  const activeLaunch = rememberCurrentGhostexT3CleanupCandidate();
  const registry = readCleanupRegistry();
  const now = Date.now();
  let changed = false;
  for (const [key, candidate] of Object.entries(registry)) {
    if (
      cleanupInFlightKeys.has(key) ||
      isSameCleanupCandidate(activeLaunch, candidate) ||
      !isCandidatePastCleanupGrace(candidate, now)
    ) {
      continue;
    }
    cleanupInFlightKeys.add(key);
    try {
      /*
      CDXC:T3EmbeddedCleanup 2026-07-01-02:17:
      Ghostex-created T3 draft rows should not accumulate. Cleanup may emit host removal only after the T3 renderer proves the draft/thread has no user-authored content, no attachments/context, no promoted or active session state, and is not the currently visible embedded session.
      */
      if (!candidate.t3DeletedAt) {
        if (!(await deleteEmptyT3RecordIfSafe(candidate))) {
          continue;
        }
        registry[key] = { ...candidate, t3DeletedAt: new Date().toISOString() };
        changed = true;
      }
      emitEmptySessionObserved(registry[key] ?? candidate);
    } finally {
      cleanupInFlightKeys.delete(key);
    }
  }
  if (changed) {
    writeCleanupRegistry(registry);
  }
}

export function useGhostexT3EmbeddedCleanupCoordinator(): void {
  useEffect(() => {
    rememberCurrentGhostexT3CleanupCandidate();
    const startupTimer = window.setTimeout(() => void runCleanupPass(), CLEANUP_STARTUP_DELAY_MS);
    const interval = window.setInterval(() => void runCleanupPass(), CLEANUP_INTERVAL_MS);
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, []);
}
