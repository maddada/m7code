import { useAtomValue } from "@effect/atom-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { isElectron } from "../env";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import { isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { resolveGhostexT3EmbeddedLaunch } from "../ghostex/embeddedLayout";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "90px";

function SidebarControl() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (resolveShortcutCommand(event, keybindings) !== "sidebar.toggle") return;

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings, toggleSidebar]);

  return (
    <div
      className="pointer-events-none fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50 flex h-[var(--workspace-topbar-height)] items-center"
      data-sidebar-control=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger className="pointer-events-auto" aria-label="Toggle main sidebar" />
          }
        />
        <TooltipPopup side="bottom">
          Toggle main sidebar{shortcutLabel ? ` (${shortcutLabel})` : ""}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const ghostexEmbeddedLaunch = useMemo(
    () => resolveGhostexT3EmbeddedLaunch(searchStr),
    [searchStr],
  );
  const defaultSidebarOpen = ghostexEmbeddedLaunch?.t3SidebarMode === "collapsed" ? false : true;
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);
  const embeddedLaunchKey = ghostexEmbeddedLaunch
    ? `${ghostexEmbeddedLaunch.ghostexProjectId}:${ghostexEmbeddedLaunch.ghostexSessionId}:${ghostexEmbeddedLaunch.t3SidebarMode}`
    : "standalone";
  const macosWindowControlsStyle =
    isElectron && isMacPlatform(navigator.platform)
      ? ({ "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET } as CSSProperties)
      : undefined;

  useEffect(() => {
    /*
    CDXC:T3SessionOwnership 2026-07-01-02:17:
    Ghostex embedded T3 panes should start with T3's own sidebar collapsed, but not hidden. Reset the controlled sidebar state only when the embedding descriptor changes so the visible rail/trigger can still expand settings and upstream controls during the current session.
    */
    setSidebarOpen(defaultSidebarOpen);
  }, [defaultSidebarOpen, embeddedLaunchKey]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        void navigate({ to: "/settings" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider
      className="h-dvh! min-h-0!"
      defaultOpen={defaultSidebarOpen}
      onOpenChange={setSidebarOpen}
      open={sidebarOpen}
      style={macosWindowControlsStyle}
    >
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground"
        resizable={{
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ nextWidth, wrapper }) =>
            wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <ThreadSidebar />
        <SidebarRail />
      </Sidebar>
      {children}
      <SidebarControl />
    </SidebarProvider>
  );
}
