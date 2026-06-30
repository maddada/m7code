import { useEffect, useMemo, useRef } from "react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  readCurrentGhostexT3EmbeddedLaunch,
  rememberGhostexT3EmbeddedLaunchFromSearch,
  type GhostexT3EmbeddedLaunch,
} from "./embeddedLaunch";

export type GhostexT3ActivityState = "attention" | "idle" | "working";

type GhostexT3HostEventKind =
  | "emptySessionObserved"
  | "navigationRequested"
  | "ready"
  | "threadActivityChanged"
  | "threadBound"
  | "threadTitleChanged";

export type GhostexT3HostEvent = {
  activity?: GhostexT3ActivityState;
  environmentId: string;
  ghostexProjectId: string;
  ghostexSessionId: string;
  kind: GhostexT3HostEventKind;
  projectId: string;
  t3SidebarMode: GhostexT3EmbeddedLaunch["t3SidebarMode"];
  threadId: string;
  title?: string | undefined;
  titleSource?: "generated";
};

function normalizeThreadTitle(title: string | null | undefined): string | undefined {
  const normalized = title?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  const lower = normalized.toLowerCase();
  if (
    lower === "t3 code" ||
    lower === "t3 code (alpha)" ||
    lower === "no active thread" ||
    lower === "pick a thread to continue"
  ) {
    return undefined;
  }
  return normalized.slice(0, 240);
}

function eventFromLaunch(
  kind: GhostexT3HostEventKind,
  launch: GhostexT3EmbeddedLaunch,
  input: {
    activity?: GhostexT3ActivityState;
    threadId?: string;
    title?: string | null | undefined;
  },
): GhostexT3HostEvent {
  const title = normalizeThreadTitle(input.title);
  return {
    ...(input.activity ? { activity: input.activity } : {}),
    environmentId: launch.environmentId,
    ghostexProjectId: launch.ghostexProjectId,
    ghostexSessionId: launch.ghostexSessionId,
    kind,
    projectId: launch.projectId,
    t3SidebarMode: launch.t3SidebarMode,
    threadId: input.threadId?.trim() || launch.threadId,
    ...(title ? { title, titleSource: "generated" as const } : {}),
  };
}

export function emitGhostexT3HostEvent(
  kind: GhostexT3HostEventKind,
  input: {
    activity?: GhostexT3ActivityState;
    launch?: GhostexT3EmbeddedLaunch | null;
    threadId?: string;
    title?: string | null | undefined;
  } = {},
): boolean {
  const launch = input.launch ?? readCurrentGhostexT3EmbeddedLaunch();
  if (!launch) {
    return false;
  }

  const event = eventFromLaunch(kind, launch, input);
  const message = { event, type: "ghostexT3EmbeddedEvent" };
  try {
    window.postMessage(message, window.location.origin);
  } catch {}
  try {
    window.webkit?.messageHandlers?.ghostexT3CodePaneDiagnostics?.postMessage({
      event,
      type: "ghostex-embedded-event",
    });
  } catch {}
  return true;
}

export function emitGhostexT3NavigationRequested(threadId: string, title?: string | null): boolean {
  return emitGhostexT3HostEvent("navigationRequested", { threadId, title });
}

export function useGhostexT3HostSync(input: {
  activity: GhostexT3ActivityState;
  environmentId: EnvironmentId;
  routeKind: "draft" | "server";
  searchStr?: string;
  threadId: ThreadId;
  title?: string | null | undefined;
}): void {
  const launch = useMemo(
    () =>
      input.searchStr !== undefined
        ? rememberGhostexT3EmbeddedLaunchFromSearch(input.searchStr)
        : readCurrentGhostexT3EmbeddedLaunch(),
    [input.searchStr],
  );
  const title = normalizeThreadTitle(input.title);
  const threadId = String(input.threadId);
  const environmentId = String(input.environmentId);
  const readyKeyRef = useRef("");
  const titleKeyRef = useRef("");
  const activityKeyRef = useRef("");

  useEffect(() => {
    window.__VSMUX_T3_ACTIVE_THREAD_ID__ = threadId;
    window.__VSMUX_T3_ACTIVE_THREAD_TITLE__ = title ?? "";
  }, [threadId, title]);

  useEffect(() => {
    if (!launch || environmentId !== launch.environmentId) {
      return;
    }
    const key = `${launch.ghostexProjectId}:${launch.ghostexSessionId}:${threadId}`;
    if (readyKeyRef.current === key) {
      return;
    }
    readyKeyRef.current = key;
    /*
    CDXC:T3SessionOwnership 2026-07-01-02:17:
    Embedded T3 reports thread binding through a host event keyed by the Ghostex session row. The payload carries only stable IDs, title metadata, and activity state so gxserver can update exactly that `kind: "t3"` row without renderer-created fallback sessions.
    */
    emitGhostexT3HostEvent("threadBound", { launch, threadId, title });
    emitGhostexT3HostEvent("ready", { launch, threadId, title });
  }, [environmentId, launch, threadId, title]);

  useEffect(() => {
    if (!launch || !title) {
      return;
    }
    const key = `${launch.ghostexProjectId}:${launch.ghostexSessionId}:${threadId}:${title}`;
    if (titleKeyRef.current === key) {
      return;
    }
    titleKeyRef.current = key;
    emitGhostexT3HostEvent("threadTitleChanged", { launch, threadId, title });
  }, [launch, threadId, title]);

  useEffect(() => {
    if (!launch) {
      return;
    }
    const key = `${launch.ghostexProjectId}:${launch.ghostexSessionId}:${threadId}:${input.activity}`;
    if (activityKeyRef.current === key) {
      return;
    }
    activityKeyRef.current = key;
    emitGhostexT3HostEvent("threadActivityChanged", {
      activity: input.activity,
      launch,
      threadId,
      title,
    });
  }, [input.activity, launch, threadId, title]);
}
