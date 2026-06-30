import { RouterProvider } from "@tanstack/react-router";

import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { PreviewAutomationHosts } from "./components/preview/PreviewAutomationHosts";
import { useGhostexT3EmbeddedCleanupCoordinator } from "./ghostex/embeddedCleanup";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

function GhostexT3EmbeddedCleanupHost() {
  useGhostexT3EmbeddedCleanupCoordinator();
  return null;
}

/**
 * Owns renderer-wide providers. The Electron browser host intentionally sits
 * outside the router so its webviews survive route transitions, but it must
 * share the same atom registry as routed UI.
 *
 * CDXC:T3EmbeddedCleanup 2026-07-01-02:17:
 * Mount the embedded T3 cleanup coordinator once per renderer runtime so it can retry empty Ghostex-created draft cleanup every 15 minutes without tying deletion to a specific chat route render.
 */
export function AppRoot({ router }: { readonly router: AppRouter }) {
  return (
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
      <GhostexT3EmbeddedCleanupHost />
      <PreviewAutomationHosts />
      <ElectronBrowserHost />
    </AppAtomRegistryProvider>
  );
}
