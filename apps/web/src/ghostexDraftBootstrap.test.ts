import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { DraftId, useComposerDraftStore } from "./composerDraftStore";
import {
  ensureGhostexDraftThreadSession,
  readGhostexDraftIdFromLaunchSearch,
  readGhostexDraftThreadBootstrap,
  stableGhostexDraftIdFromSessionId,
} from "./ghostexDraftBootstrap";
import chatIndexRouteSource from "./routes/_chat.index.tsx?raw";
import draftRouteSource from "./routes/_chat.draft.$draftId.tsx?raw";

function resetComposerDraftStore() {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    stickyModelSelectionByProvider: {},
    stickyActiveProvider: null,
  });
}

describe("ghostexDraftBootstrap", () => {
  beforeEach(() => {
    resetComposerDraftStore();
  });

  it("ignores ordinary draft routes and incomplete Ghostex draft requests", () => {
    expect(readGhostexDraftThreadBootstrap(new URLSearchParams())).toBeNull();
    expect(
      readGhostexDraftThreadBootstrap(
        new URLSearchParams({
          ghostexDraft: "1",
          environmentId: "environment-ghostex",
          projectId: "project-ghostex",
        }),
      ),
    ).toBeNull();
  });

  it("reads the native draft bootstrap ids from marked query params", () => {
    const bootstrap = readGhostexDraftThreadBootstrap(
      new URLSearchParams({
        ghostexDraft: "1",
        environmentId: " environment-ghostex ",
        projectId: " project-ghostex ",
        threadId: " thread-ghostex ",
        createdAt: "2026-06-23T03:21:00.000Z",
      }),
    );

    expect(bootstrap).toEqual({
      environmentId: EnvironmentId.make("environment-ghostex"),
      projectId: ProjectId.make("project-ghostex"),
      threadId: ThreadId.make("thread-ghostex"),
      createdAt: "2026-06-23T03:21:00.000Z",
    });
  });

  it("derives stable Ghostex draft ids from native launch session ids", () => {
    expect(stableGhostexDraftIdFromSessionId("G34e2")).toBe(DraftId.make("ghostex-draft-g34e2"));
    expect(stableGhostexDraftIdFromSessionId(" Project:Session 42 ")).toBe(
      DraftId.make("ghostex-draft-project-session-42"),
    );

    expect(
      readGhostexDraftIdFromLaunchSearch(
        new URLSearchParams({
          ghostexEmbedded: "1",
          ghostexDraft: "1",
          ghostexProjectId: "P3lv0",
          ghostexSessionId: "G34e2",
          environmentId: "environment-ghostex",
          projectId: "project-ghostex",
          threadId: "thread-ghostex",
        }),
      ),
    ).toBe(DraftId.make("ghostex-draft-g34e2"));
  });

  it("creates an idempotent draft session for the native thread id", () => {
    const draftId = DraftId.make("draft-ghostex");
    const environmentId = EnvironmentId.make("environment-ghostex");
    const projectId = ProjectId.make("project-ghostex");
    const threadId = ThreadId.make("thread-ghostex");
    const projectRef = scopeProjectRef(environmentId, projectId);

    expect(
      ensureGhostexDraftThreadSession(draftId, {
        environmentId,
        projectId,
        threadId,
        createdAt: "2026-06-23T03:21:00.000Z",
      }),
    ).toBe(true);
    expect(
      ensureGhostexDraftThreadSession(draftId, {
        environmentId,
        projectId,
        threadId: ThreadId.make("thread-ignored"),
      }),
    ).toBe(true);

    expect(useComposerDraftStore.getState().getDraftSession(draftId)).toMatchObject({
      environmentId,
      projectId,
      threadId,
      logicalProjectKey: scopedProjectKey(projectRef),
      createdAt: "2026-06-23T03:21:00.000Z",
      branch: null,
      worktreePath: null,
      envMode: "local",
      startFromOrigin: false,
    });
  });

  it("seeds Ghostex draft routes before the draft route component renders", () => {
    const routeSource = draftRouteSource;

    const componentSource = routeSource.slice(
      routeSource.indexOf("function DraftChatThreadRouteView()"),
      routeSource.indexOf("export const Route"),
    );
    expect(routeSource).toContain("useLocation");
    expect(routeSource).toContain("location.searchStr");
    expect(routeSource).toContain("new URLSearchParams(searchStr)");
    expect(routeSource).toContain("beforeLoad");
    expect(routeSource).toContain("seedGhostexDraftThreadSessionFromRoute");
    expect(routeSource).not.toContain("window.location.search");
    expect(routeSource).not.toContain("useMemo");
    expect(componentSource).toContain("ensureGhostexDraftThreadSession");
    expect(componentSource).toContain("draftSession || !ghostexDraftBootstrap");
  });

  it("routes embedded Ghostex draft launches from the chat index to their draft composer", () => {
    const routeSource = chatIndexRouteSource;

    expect(routeSource).toContain("readGhostexDraftIdFromLaunchSearch");
    expect(routeSource).toContain("ensureGhostexDraftThreadSession");
    expect(routeSource).toContain('to: "/draft/$draftId"');
    expect(routeSource).toContain("buildDraftThreadRouteParams");
    expect(routeSource).toContain("if (ghostexThreadRoute || ghostexDraftRoute)");
  });
});
