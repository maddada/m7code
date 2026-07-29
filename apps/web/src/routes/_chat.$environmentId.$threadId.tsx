import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import { rememberGhostexT3EmbeddedLaunchFromSearch } from "../ghostex/embeddedLaunch";
import { resolveThreadRouteRef, resolveThreadRouteRenderState } from "../threadRoutes";
import { SidebarInset } from "~/components/ui/sidebar";
import {
  useEnvironmentThreadRefs,
  useThreadDetail,
  useThreadShell,
  useThreadStatus,
} from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const ghostexEmbeddedLaunch = useMemo(
    () => rememberGhostexT3EmbeddedLaunchFromSearch(searchStr),
    [searchStr],
  );
  const shell = useEnvironmentQuery(
    threadRef === null ? null : environmentShell.stateAtom(threadRef.environmentId),
  );
  const serverThreadShell = useThreadShell(threadRef);
  const serverThreadDetail = useThreadDetail(threadRef);
  const serverThreadStatus = useThreadStatus(threadRef);
  const environmentThreadRefs = useEnvironmentThreadRefs(threadRef?.environmentId ?? null);
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const environmentHasServerThreads = environmentThreadRefs.length > 0;
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadShellExists: serverThreadShell !== null,
    serverThreadDetailExists: serverThreadDetail !== null,
    serverThreadDetailDeleted: serverThreadStatus === "deleted",
    draftThreadExists,
  });
  const serverThreadStarted = threadHasStarted(serverThreadDetail);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;
  const isGhostexEmbeddedThreadRoute =
    ghostexEmbeddedLaunch !== null &&
    threadRef !== null &&
    ghostexEmbeddedLaunch.environmentId === threadRef.environmentId &&
    ghostexEmbeddedLaunch.threadId === threadRef.threadId;

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) {
      return;
    }

    /*
    CDXC:T3SessionRestore 2026-07-01-19:19:
    Ghostex embedded T3 session cards are durable bindings to a specific thread route. A transient orchestration snapshot gap must not replace that URL with `/`, because the pane then shows the generic thread picker even though the bound thread still exists in T3 and gxserver.
    */
    if (renderState === "missing" && environmentHasAnyThreads && !isGhostexEmbeddedThreadRoute) {
      void navigate({ to: "/", replace: true });
    }
  }, [
    bootstrapComplete,
    environmentHasAnyThreads,
    isGhostexEmbeddedThreadRoute,
    navigate,
    renderState,
    threadRef,
  ]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread, serverThreadStarted, threadRef]);

  if (!threadRef || renderState !== "ready") {
    return null;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ChatView
        environmentId={threadRef.environmentId}
        threadId={threadRef.threadId}
        routeKind="server"
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  component: ChatThreadRouteView,
});
