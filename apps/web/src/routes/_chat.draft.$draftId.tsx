import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import {
  DraftId,
  markPromotedDraftThreadByRef,
  useComposerDraftStore,
} from "../composerDraftStore";
import { SidebarInset } from "../components/ui/sidebar";
import {
  ensureGhostexDraftThreadSession,
  readGhostexDraftThreadBootstrap,
} from "../ghostexDraftBootstrap";
import { buildThreadRouteParams } from "../threadRoutes";
import { useThread, useThreadRefs } from "../state/entities";

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const ghostexDraftBootstrap = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return readGhostexDraftThreadBootstrap(new URLSearchParams(window.location.search));
  }, [rawDraftId]);
  if (ghostexDraftBootstrap) {
    /**
     * CDXC:T3GhostexDraftBootstrap 2026-06-23-06:55:
     * Ghostex opens a new T3 pane through a draft URL and users should land on
     * the same composer surface as T3's own project-sidebar plus button, not
     * the "Pick a thread" index shell. Seed the external draft session before
     * selecting route state so the first committed render can show ChatView.
     */
    ensureGhostexDraftThreadSession(draftId, ghostexDraftBootstrap);
  }
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const threadRefs = useThreadRefs();
  const inferredThreadRef = draftSession
    ? (threadRefs.find(
        (ref) =>
          ref.environmentId === draftSession.environmentId &&
          ref.threadId === draftSession.threadId,
      ) ?? null)
    : null;
  const serverThreadRef = draftSession?.promotedTo ?? inferredThreadRef;
  const serverThread = useThread(serverThreadRef);
  const serverThreadStarted = threadHasStarted(serverThread);
  const canonicalThreadRef = serverThreadStarted ? serverThreadRef : null;

  useEffect(() => {
    if (!inferredThreadRef || draftSession?.promotedTo) {
      return;
    }
    markPromotedDraftThreadByRef(inferredThreadRef);
  }, [draftSession?.promotedTo, inferredThreadRef]);

  useEffect(() => {
    if (!canonicalThreadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(canonicalThreadRef),
      replace: true,
    });
  }, [canonicalThreadRef, navigate]);

  useEffect(() => {
    if (draftSession || canonicalThreadRef || ghostexDraftBootstrap) {
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [canonicalThreadRef, draftSession, ghostexDraftBootstrap, navigate]);

  if (canonicalThreadRef) {
    return (
      <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
        <ChatView
          environmentId={canonicalThreadRef.environmentId}
          threadId={canonicalThreadRef.threadId}
          routeKind="server"
        />
      </SidebarInset>
    );
  }

  if (!draftSession) {
    return null;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ChatView
        draftId={draftId}
        environmentId={draftSession.environmentId}
        threadId={draftSession.threadId}
        routeKind="draft"
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/draft/$draftId")({
  component: DraftChatThreadRouteView,
});
