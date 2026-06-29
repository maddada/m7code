import { readFileSync } from "node:fs";
import {
  scopedProjectKey,
  scopeProjectRef,
} from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { DraftId, useComposerDraftStore } from "./composerDraftStore";
import {
  ensureGhostexDraftThreadSession,
  readGhostexDraftThreadBootstrap,
} from "./ghostexDraftBootstrap";

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

  it("seeds Ghostex draft routes before the draft session selector runs", () => {
    const routeSource = readFileSync(
      new URL("./routes/_chat.draft.$draftId.tsx", import.meta.url),
      "utf8",
    );

    expect(routeSource).toContain("useLocation");
    expect(routeSource).toContain("location.searchStr");
    expect(routeSource).toContain("new URLSearchParams(searchStr)");
    expect(routeSource).not.toContain("window.location.search");
    expect(routeSource).not.toContain("useMemo");
    expect(routeSource.indexOf("ensureGhostexDraftThreadSession(draftId")).toBeLessThan(
      routeSource.indexOf("const draftSession = useComposerDraftStore"),
    );
    expect(routeSource).not.toContain("draftSession || !ghostexDraftBootstrap");
  });
});
