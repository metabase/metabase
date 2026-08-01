import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import { taskStarted } from "metabase-enterprise/remote_sync/sync-task-slice";
import {
  createMockRemoteSyncWorktree,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../../scope";

import { BranchMenu } from "./BranchMenu";

jest.mock("metabase/common/content-studio/analytics", () => ({
  trackContentStudioWorktreeDeleted: jest.fn(),
}));

const { trackContentStudioWorktreeDeleted } = jest.requireMock(
  "metabase/common/content-studio/analytics",
);

const WORKTREE = createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" });

function setup() {
  setupRemoteSyncEndpoints({ worktrees: [WORKTREE] });

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "remote-sync-enabled": true,
      "remote-sync-branch": "main",
      "remote-sync-type": "read-write",
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
  });

  setupEnterpriseOnlyPlugin("remote_sync");

  const { history, store } = renderWithProviders(
    <Route path="/">
      <Route
        path="content-studio"
        element={
          <ContentStudioScopeProvider>
            <Outlet />
          </ContentStudioScopeProvider>
        }
      >
        <Route
          path="collections"
          element={<BranchMenu worktree={WORKTREE} />}
        />
      </Route>
    </Route>,
    {
      initialRoute: "/content-studio/collections?worktree=5",
      withRouter: true,
      storeInitialState,
    },
  );

  return { history, store };
}

function openMenu() {
  return userEvent.click(
    screen.getByRole("button", { name: "Branch options" }),
  );
}

describe("BranchMenu", () => {
  beforeEach(() => {
    trackContentStudioWorktreeDeleted.mockClear();
  });

  afterEach(() => {
    reinitialize();
  });

  it("offers the branch's actions", async () => {
    setup();

    await openMenu();

    const menu = within(await screen.findByRole("menu"));
    expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Delete checkout"]);
  });

  it("leaves creating content to the sidebar sections", async () => {
    setup();

    await openMenu();

    expect(
      within(await screen.findByRole("menu")).queryByRole("menuitem", {
        name: /New collection/,
      }),
    ).not.toBeInTheDocument();
  });

  it("disables every action while a sync runs", async () => {
    const { store } = setup();

    await openMenu();
    act(() => {
      store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
    });

    const items = within(await screen.findByRole("menu")).getAllByRole(
      "menuitem",
    );
    items.forEach((item) => expect(item).toBeDisabled());
  });

  it("deletes the checkout after confirmation and returns to the main branch", async () => {
    const { history, store } = setup();

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete checkout/ }),
    );
    expect(
      screen.getByText(
        'Everything checked out from the "feature-a" branch will be deleted from this instance. The branch itself won\'t be touched.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete checkout" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "express:/api/ee/remote-sync/worktree/:id",
        ),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      "express:/api/ee/remote-sync/worktree/:id",
    );
    expect(call?.url).toContain("/worktree/5");

    await waitFor(() => {
      expect(history?.getCurrentLocation().search).toBe("");
    });
    const messages = store.getState().undo.map((undo) => String(undo.message));
    expect(messages).toContain('Deleted the "feature-a" checkout');
    expect(trackContentStudioWorktreeDeleted).toHaveBeenCalledTimes(1);
    expect(trackContentStudioWorktreeDeleted).toHaveBeenCalledWith(5);
  });

  it("keeps the checkout when deleting fails", async () => {
    const { history, store } = setup();
    fetchMock.removeRoute("remote-sync-worktree-delete");
    fetchMock.delete(
      "express:/api/ee/remote-sync/worktree/:id",
      { status: 500, body: { message: "boom" } },
      { name: "remote-sync-worktree-delete" },
    );

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete checkout/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete checkout" }),
    );

    await waitFor(() => {
      const messages = store
        .getState()
        .undo.map((undo) => String(undo.message));
      expect(messages.some((message) => /boom/.test(message))).toBe(true);
    });
    expect(history?.getCurrentLocation().search).toBe("?worktree=5");
    expect(trackContentStudioWorktreeDeleted).not.toHaveBeenCalled();
  });
});
