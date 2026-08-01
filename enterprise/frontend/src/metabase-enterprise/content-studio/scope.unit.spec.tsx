import userEvent from "@testing-library/user-event";

import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { ContentStudioSection } from "metabase/content-studio/app/pages/ContentStudioLayout";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import type {
  RemoteSyncWorktree,
  RemoteSyncWorktreeId,
} from "metabase-types/api";
import {
  createMockRemoteSyncWorktree,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  ContentStudioScopeProvider,
  useContentStudioEntityScope,
  useContentStudioScope,
} from "./scope";

const OTHER_WORKTREE_ID = 7;

function ScopeProbe() {
  const { worktreeId, setScope } = useContentStudioScope();

  return (
    <div>
      <div data-testid="scope">{String(worktreeId)}</div>
      <button onClick={() => setScope(OTHER_WORKTREE_ID)}>
        {"Switch branch"}
      </button>
      <button onClick={() => setScope(null)}>{"Switch to main"}</button>
    </div>
  );
}

function EntityProbe({
  worktreeId,
  section,
}: {
  worktreeId: RemoteSyncWorktreeId | null | undefined;
  section?: ContentStudioSection;
}) {
  useContentStudioEntityScope(worktreeId, section);

  return <ScopeProbe />;
}

type SetupOpts = {
  initialRoute?: string;
  worktrees?: RemoteSyncWorktree[];
  entityWorktreeId?: RemoteSyncWorktreeId | null;
  entitySection?: ContentStudioSection;
  isRemoteSyncEnabled?: boolean;
};

function setup({
  initialRoute = "/content-studio/collections",
  worktrees = [],
  entityWorktreeId,
  entitySection,
  isRemoteSyncEnabled = true,
}: SetupOpts = {}) {
  setupRemoteSyncEndpoints({ worktrees });

  return renderWithProviders(
    <Route path="/">
      <Route
        path="content-studio"
        element={
          <ContentStudioScopeProvider>
            <Outlet />
          </ContentStudioScopeProvider>
        }
      >
        <Route path="collections" element={<ScopeProbe />} />
        <Route path="transforms" element={<ScopeProbe />} />
        <Route path="snippets" element={<ScopeProbe />} />
        <Route
          path="snippets/:id"
          element={<EntityProbe worktreeId={entityWorktreeId} />}
        />
        <Route
          path="collection/:id"
          element={
            <EntityProbe
              worktreeId={entityWorktreeId}
              section={entitySection}
            />
          }
        />
      </Route>
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          "remote-sync-enabled": isRemoteSyncEnabled,
          "remote-sync-branch": "main",
          "remote-sync-type": "read-write",
        }),
      }),
    },
  );
}

describe("Content Studio scope", () => {
  it("is the main branch when the URL carries no branch", async () => {
    setup();

    expect(await screen.findByTestId("scope")).toHaveTextContent("null");
  });

  it("restores a deep-linked branch without falling back while the list loads", async () => {
    const { history, store } = setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await waitFor(() => {
      expect(screen.getByTestId("scope")).toHaveTextContent("5");
    });
    expect(history?.getCurrentLocation().search).toBe("?worktree=5");
    expect(store.getState().undo).toEqual([]);
  });

  it("stays on the main branch for a branch param that is not an id", async () => {
    const { history, store } = setup({
      initialRoute: "/content-studio/collections?worktree=not-an-id",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    expect(await screen.findByTestId("scope")).toHaveTextContent("null");
    // Nothing to fall back from, so the URL is left alone and nothing is said.
    expect(history?.getCurrentLocation().search).toBe("?worktree=not-an-id");
    expect(store.getState().undo).toEqual([]);
  });

  it("keeps the URL's branch on a detail page while its entity loads", async () => {
    setup({
      initialRoute: "/content-studio/collection/20?worktree=5",
      entityWorktreeId: undefined,
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    expect(await screen.findByTestId("scope")).toHaveTextContent("5");
  });

  it("prefers the loaded entity's branch over the one in the URL", async () => {
    setup({
      initialRoute: "/content-studio/collection/20?worktree=5",
      entityWorktreeId: OTHER_WORKTREE_ID,
      worktrees: [
        createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" }),
        createMockRemoteSyncWorktree({
          id: OTHER_WORKTREE_ID,
          branch: "feature-b",
        }),
      ],
    });

    expect(await screen.findByTestId("scope")).toHaveTextContent(
      String(OTHER_WORKTREE_ID),
    );
  });

  it("stays on the main branch when remote sync is not set up", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=5",
      isRemoteSyncEnabled: false,
    });

    expect(await screen.findByTestId("scope")).toHaveTextContent("null");
  });

  it("falls back to the main branch and notifies when the branch is gone", async () => {
    const { history, store } = setup({
      initialRoute: "/content-studio/collections?worktree=99",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await waitFor(() => {
      expect(history?.getCurrentLocation().search).toBe("");
    });
    expect(screen.getByTestId("scope")).toHaveTextContent("null");
    expect(store.getState().undo.map((undo) => String(undo.message))).toEqual([
      "That branch is no longer checked out. Showing the main branch instead.",
    ]);
  });

  it("carries a new branch into the current section's landing URL", async () => {
    const { history } = setup({
      initialRoute: "/content-studio/transforms",
      worktrees: [
        createMockRemoteSyncWorktree({
          id: OTHER_WORKTREE_ID,
          branch: "feature-a",
        }),
      ],
    });

    await userEvent.click(await screen.findByText("Switch branch"));

    expect(history?.getCurrentLocation().pathname).toBe(
      "/content-studio/transforms",
    );
    expect(history?.getCurrentLocation().search).toBe("?worktree=7");
  });

  it("leaves a detail page for the section landing when the branch changes", async () => {
    const { history } = setup({
      initialRoute: "/content-studio/snippets/1",
      entityWorktreeId: 5,
      worktrees: [
        createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" }),
        createMockRemoteSyncWorktree({
          id: OTHER_WORKTREE_ID,
          branch: "feature-b",
        }),
      ],
    });

    await userEvent.click(await screen.findByText("Switch branch"));

    expect(history?.getCurrentLocation().pathname).toBe(
      "/content-studio/snippets",
    );
    expect(history?.getCurrentLocation().search).toBe("?worktree=7");
  });

  it("follows the branch of the entity a detail page loaded", async () => {
    setup({
      initialRoute: "/content-studio/snippets/1",
      entityWorktreeId: 5,
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    expect(await screen.findByTestId("scope")).toHaveTextContent("5");
  });

  it("drops the entity's branch when leaving a detail page", async () => {
    const { history } = setup({
      initialRoute: "/content-studio/snippets/1",
      entityWorktreeId: 5,
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await userEvent.click(await screen.findByText("Switch to main"));

    expect(history?.getCurrentLocation().pathname).toBe(
      "/content-studio/snippets",
    );
    expect(screen.getByTestId("scope")).toHaveTextContent("null");
  });

  it("returns to the namespace root of the folder on screen when the branch changes", async () => {
    const { history } = setup({
      initialRoute: "/content-studio/collection/20",
      entityWorktreeId: null,
      entitySection: "transforms",
      worktrees: [
        createMockRemoteSyncWorktree({
          id: OTHER_WORKTREE_ID,
          branch: "feature-b",
        }),
      ],
    });

    await userEvent.click(await screen.findByText("Switch branch"));

    expect(history?.getCurrentLocation().pathname).toBe(
      "/content-studio/transforms",
    );
    expect(history?.getCurrentLocation().search).toBe("?worktree=7");
  });

  it("stays on the main branch for an entity that has no branch", async () => {
    setup({
      initialRoute: "/content-studio/snippets/1",
      entityWorktreeId: null,
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    expect(await screen.findByTestId("scope")).toHaveTextContent("null");
  });
});
