export type GhostexT3SidebarMode = "collapsed" | "normal";

export interface GhostexT3EmbeddedLaunch {
  createdAt?: string;
  environmentId: string;
  ghostexProjectId: string;
  ghostexSessionId: string;
  isDraft: boolean;
  projectId: string;
  t3SidebarMode: GhostexT3SidebarMode;
  threadId: string;
}

const GHOSTEX_EMBEDDED_FLAG = "1";
const GHOSTEX_DRAFT_FLAG = "1";

let rememberedLaunch: GhostexT3EmbeddedLaunch | null = null;

function readNonEmptyParam(search: URLSearchParams, key: string): string | null {
  const value = search.get(key)?.trim();
  return value ? value : null;
}

function cloneLaunch(launch: GhostexT3EmbeddedLaunch): GhostexT3EmbeddedLaunch {
  return { ...launch };
}

export function readGhostexT3EmbeddedLaunch(
  search: URLSearchParams,
): GhostexT3EmbeddedLaunch | null {
  if (search.get("ghostexEmbedded") !== GHOSTEX_EMBEDDED_FLAG) {
    return null;
  }

  const ghostexProjectId = readNonEmptyParam(search, "ghostexProjectId");
  const ghostexSessionId = readNonEmptyParam(search, "ghostexSessionId");
  const environmentId = readNonEmptyParam(search, "environmentId");
  const projectId = readNonEmptyParam(search, "projectId");
  const threadId = readNonEmptyParam(search, "threadId");
  if (!ghostexProjectId || !ghostexSessionId || !environmentId || !projectId || !threadId) {
    return null;
  }

  const sidebarMode = readNonEmptyParam(search, "t3SidebarMode");
  const createdAt = readNonEmptyParam(search, "createdAt");
  return {
    ...(createdAt ? { createdAt } : {}),
    environmentId,
    ghostexProjectId,
    ghostexSessionId,
    isDraft: search.get("ghostexDraft") === GHOSTEX_DRAFT_FLAG,
    projectId,
    t3SidebarMode: sidebarMode === "normal" ? "normal" : "collapsed",
    threadId,
  };
}

export function rememberGhostexT3EmbeddedLaunchFromSearch(
  search: string | URLSearchParams,
): GhostexT3EmbeddedLaunch | null {
  /*
  CDXC:T3SessionOwnership 2026-07-01-02:17:
  Ghostex launch identity must survive T3 draft promotion. TanStack route replacement can drop query params after the first real thread exists, so cache only the already validated embedded descriptor and never invent Ghostex ids in the renderer.
  */
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const launch = readGhostexT3EmbeddedLaunch(params);
  if (launch) {
    rememberedLaunch = cloneLaunch(launch);
    return cloneLaunch(launch);
  }
  return rememberedLaunch ? cloneLaunch(rememberedLaunch) : null;
}

export function readCurrentGhostexT3EmbeddedLaunch(): GhostexT3EmbeddedLaunch | null {
  if (typeof window === "undefined") {
    return rememberedLaunch ? cloneLaunch(rememberedLaunch) : null;
  }
  return rememberGhostexT3EmbeddedLaunchFromSearch(window.location.search);
}
