import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import {
  readGhostexT3EmbeddedLaunch,
  rememberGhostexT3EmbeddedLaunchFromSearch,
} from "./embeddedLaunch";

export interface GhostexDraftThreadBootstrap {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  threadId: ThreadId;
  createdAt?: string;
}

const GHOSTEX_DRAFT_FLAG = "1";

function readNonEmptyParam(search: URLSearchParams, key: string): string | null {
  const value = search.get(key)?.trim();
  return value ? value : null;
}

function normalizeGhostexDraftIdentityComponent(sessionId: string): string {
  const normalized = sessionId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}

export function stableGhostexDraftIdFromSessionId(sessionId: string): DraftId {
  /*
  CDXC:T3GhostexDraftBootstrap 2026-07-01-03:45:
  Embedded Ghostex draft panes use a host-owned session id to derive their T3 draft route. The T3 index route needs the same deterministic draft id so a native launch that lands on `/` can route itself to the composer instead of showing the thread picker.
  */
  return DraftId.make(`ghostex-draft-${normalizeGhostexDraftIdentityComponent(sessionId)}`);
}

export function readGhostexDraftIdFromLaunchSearch(search: URLSearchParams): DraftId | null {
  const embeddedLaunch = readGhostexT3EmbeddedLaunch(search);
  if (embeddedLaunch?.isDraft) {
    return stableGhostexDraftIdFromSessionId(embeddedLaunch.ghostexSessionId);
  }

  if (search.get("ghostexDraft") !== GHOSTEX_DRAFT_FLAG) {
    return null;
  }

  const ghostexSessionId = readNonEmptyParam(search, "ghostexSessionId");
  return ghostexSessionId ? stableGhostexDraftIdFromSessionId(ghostexSessionId) : null;
}

export function readGhostexDraftThreadBootstrap(
  search: URLSearchParams,
): GhostexDraftThreadBootstrap | null {
  const embeddedLaunch = rememberGhostexT3EmbeddedLaunchFromSearch(search);
  if (embeddedLaunch?.isDraft) {
    return {
      environmentId: EnvironmentId.make(embeddedLaunch.environmentId),
      projectId: ProjectId.make(embeddedLaunch.projectId),
      threadId: ThreadId.make(embeddedLaunch.threadId),
      ...(embeddedLaunch.createdAt ? { createdAt: embeddedLaunch.createdAt } : {}),
    };
  }

  if (search.get("ghostexDraft") !== GHOSTEX_DRAFT_FLAG) {
    return null;
  }

  const environmentId = readNonEmptyParam(search, "environmentId");
  const projectId = readNonEmptyParam(search, "projectId");
  const threadId = readNonEmptyParam(search, "threadId");
  if (!environmentId || !projectId || !threadId) {
    return null;
  }

  const createdAt = readNonEmptyParam(search, "createdAt") ?? undefined;
  return {
    environmentId: EnvironmentId.make(environmentId),
    projectId: ProjectId.make(projectId),
    threadId: ThreadId.make(threadId),
    ...(createdAt ? { createdAt } : {}),
  };
}

/**
 * CDXC:T3GhostexDraftBootstrap 2026-07-01-02:17:
 * Ghostex-owned embedded T3 sessions seed the draft composer from the launch
 * descriptor before React chooses route state. The renderer may use only the
 * host-provided T3 environment/project/thread ids; it must not invent Ghostex
 * session ids, workspace paths, URLs, commands, or trusted metadata.
 */
export function ensureGhostexDraftThreadSession(
  draftId: DraftId,
  bootstrap: GhostexDraftThreadBootstrap,
): boolean {
  const store = useComposerDraftStore.getState();
  if (store.getDraftSession(draftId)) {
    return true;
  }

  const projectRef = scopeProjectRef(bootstrap.environmentId, bootstrap.projectId);
  store.setLogicalProjectDraftThreadId(scopedProjectKey(projectRef), projectRef, draftId, {
    threadId: bootstrap.threadId,
    ...(bootstrap.createdAt ? { createdAt: bootstrap.createdAt } : {}),
    branch: null,
    worktreePath: null,
    envMode: "local",
    startFromOrigin: false,
  });
  store.applyStickyState(draftId);
  return store.getDraftSession(draftId) !== null;
}
