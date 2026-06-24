import {
  scopedProjectKey,
  scopeProjectRef,
} from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { DraftId, useComposerDraftStore } from "./composerDraftStore";

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

export function readGhostexDraftThreadBootstrap(
  search: URLSearchParams,
): GhostexDraftThreadBootstrap | null {
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
 * CDXC:T3GhostexDraftBootstrap 2026-06-23-07:21:
 * Ghostex native panes open new T3 Code sessions as draft routes, not
 * server-backed thread routes. Register the native-provided draft with T3's
 * composer draft store so the first user message promotes the same stable
 * thread id into a real T3 thread instead of creating an empty thread on pane
 * bootstrap.
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
