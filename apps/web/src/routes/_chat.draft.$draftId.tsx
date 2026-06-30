import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
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

function seedGhostexDraftThreadSessionFromRoute(input: {
  draftId: DraftId;
  searchStr: string;
}) {
  const ghostexDraftBootstrap = readGhostexDraftThreadBootstrap(
    new URLSearchParams(input.searchStr),
  );
  if (ghostexDraftBootstrap) {
    /*
    CDXC:T3GhostexDraftBootstrap 2026-07-01-03:09:
    Embedded Ghostex draft launches must seed the draft session before the route component renders ChatView. Mutating the zustand draft store during render can leave ChatView with a stale external-store snapshot and show the "No active thread" empty state even though the URL contains a valid Ghostex draft descriptor.
    */
    ensureGhostexDraftThreadSession(input.draftId, ghostexDraftBootstrap);
  }
  return ghostexDraftBootstrap;
}

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const searchStr = useLocation({ select: (location) => location.searchStr });
  /**
   * CDXC:T3GhostexDraftBootstrap 2026-06-28-20:26:
   * Ghostex can retarget an existing embedded WKWebView from the T3 index shell to a native draft URL.
   * Read the active TanStack location search string instead of memoizing a global browser query so React Compiler cannot hoist a previous empty query parse and leave new native T3 panes on the thread picker.
   */
  const ghostexDraftBootstrap = readGhostexDraftThreadBootstrap(
    new URLSearchParams(searchStr),
  );
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
    if (draftSession || !ghostexDraftBootstrap) {
      return;
    }
    /*
    CDXC:T3GhostexDraftBootstrap 2026-07-01-03:45:
    Persisted composer-store hydration can run after route beforeLoad and clear the freshly seeded Ghostex draft. Re-assert the validated host-owned draft from an effect so new embedded T3 sessions remain on an empty composer instead of falling through to the thread picker.
    */
    ensureGhostexDraftThreadSession(draftId, ghostexDraftBootstrap);
  }, [draftId, draftSession, ghostexDraftBootstrap]);

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
  beforeLoad: ({ location, params }) => {
    return {
      ghostexDraftBootstrap: seedGhostexDraftThreadSessionFromRoute({
        draftId: DraftId.make(params.draftId),
        searchStr: location.searchStr,
      }),
    };
  },
  component: DraftChatThreadRouteView,
});
