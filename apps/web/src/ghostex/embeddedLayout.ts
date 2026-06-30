import {
  rememberGhostexT3EmbeddedLaunchFromSearch,
  type GhostexT3EmbeddedLaunch,
} from "./embeddedLaunch";

export function resolveGhostexT3SidebarDefaultOpen(search: string): boolean {
  const launch = rememberGhostexT3EmbeddedLaunchFromSearch(search);
  return launch?.t3SidebarMode === "collapsed" ? false : true;
}

export function resolveGhostexT3EmbeddedLaunch(search: string): GhostexT3EmbeddedLaunch | null {
  return rememberGhostexT3EmbeddedLaunchFromSearch(search);
}
