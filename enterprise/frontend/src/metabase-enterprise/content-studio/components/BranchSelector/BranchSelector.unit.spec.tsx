import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import { taskStarted } from "metabase-enterprise/remote_sync/sync-task-slice";
import type { RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockRemoteSyncWorktree,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../../scope";

import { BranchSelector } from "./BranchSelector";

jest.mock("metabase/common/content-studio/analytics", () => ({
  trackContentStudioScopeChanged: jest.fn(),
}));

const { trackContentStudioScopeChanged } = jest.requireMock(
  "metabase/common/content-studio/analytics",
);

type SetupOpts = {
  initialRoute?: string;
  worktrees?: RemoteSyncWorktree[];
  hasRemoteSyncPlugin?: boolean;
  isRemoteSyncEnabled?: boolean;
};

function setup({
  initialRoute = "/content-studio/collections",
  worktrees = [],
  hasRemoteSyncPlugin = false,
  isRemoteSyncEnabled = true,
}: SetupOpts = {}) {
  setupRemoteSyncEndpoints({ worktrees });

  const onCheckOutBranch = jest.fn();

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "remote-sync-enabled": isRemoteSyncEnabled,
      "remote-sync-branch": "main",
      "remote-sync-type": "read-write",
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
  });

  if (hasRemoteSyncPlugin) {
    setupEnterpriseOnlyPlugin("remote_sync");
  }

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
          element={
            <BranchSelector
              onCheckOutBranch={onCheckOutBranch}
              branchActions={<button>{"Branch options"}</button>}
            />
          }
        />
      </Route>
    </Route>,
    { initialRoute, withRouter: true, storeInitialState },
  );

  return { history, store, onCheckOutBranch };
}

function getBranchButton() {
  return screen.getByRole("button", { name: /^Branch:/ });
}

function findBranchButton() {
  return screen.findByRole("button", { name: /^Branch:/ });
}

function openBranchMenu() {
  return userEvent.click(getBranchButton());
}

describe("BranchSelector", () => {
  beforeEach(() => {
    trackContentStudioScopeChanged.mockClear();
  });

  afterEach(() => {
    reinitialize();
  });

  it("shows the main branch by default", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: "Branch: Main (main)" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when remote sync is not set up", () => {
    setup({ isRemoteSyncEnabled: false });

    expect(
      screen.queryByTestId("content-studio-branch-selector"),
    ).not.toBeInTheDocument();
  });

  it("lists the main branch and the checked-out branches sorted by name", async () => {
    setup({
      worktrees: [
        createMockRemoteSyncWorktree({ id: 5, branch: "zebra" }),
        createMockRemoteSyncWorktree({ id: 6, branch: "alpha" }),
      ],
    });

    await openBranchMenu();

    const items = await screen.findAllByRole("option");
    expect(items.map((item) => item.textContent)).toEqual([
      "Main (main)",
      "alpha",
      "zebra",
      "Check out a branch…",
    ]);
  });

  it("offers only the main branch when nothing is checked out", async () => {
    setup();

    await openBranchMenu();

    const items = await screen.findAllByRole("option");
    expect(items.map((item) => item.textContent)).toEqual([
      "Main (main)",
      "Check out a branch…",
    ]);
  });

  it("filters the branches by the search term", async () => {
    setup({
      worktrees: [
        createMockRemoteSyncWorktree({ id: 5, branch: "zebra" }),
        createMockRemoteSyncWorktree({ id: 6, branch: "alpha" }),
      ],
    });

    await openBranchMenu();
    await userEvent.type(
      await screen.findByPlaceholderText("Find a branch…"),
      "zeb",
    );

    expect(await screen.findByRole("option", { name: "zebra" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "alpha" }),
    ).not.toBeInTheDocument();
  });

  it("scopes the studio to the selected branch", async () => {
    const { history } = setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await openBranchMenu();
    await userEvent.click(
      await screen.findByRole("option", { name: "feature-a" }),
    );

    expect(history?.getCurrentLocation().search).toBe("?worktree=5");
    expect(
      screen.getByRole("button", { name: "Branch: feature-a" }),
    ).toBeInTheDocument();
    expect(trackContentStudioScopeChanged).toHaveBeenCalledTimes(1);
    expect(trackContentStudioScopeChanged).toHaveBeenCalledWith(5);
  });

  it("does not report a scope change when the current branch is picked again", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await openBranchMenu();
    await userEvent.click(
      await screen.findByRole("option", { name: /feature-a/ }),
    );

    expect(trackContentStudioScopeChanged).not.toHaveBeenCalled();
  });

  it("scopes the studio to a branch picked with the keyboard", async () => {
    const { history } = setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await openBranchMenu();
    await screen.findByPlaceholderText("Find a branch…");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(history?.getCurrentLocation().search).toBe("?worktree=5");
  });

  it("scopes the studio back to the main branch", async () => {
    const { history } = setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await openBranchMenu();
    await userEvent.click(
      await screen.findByRole("option", { name: "Main (main)" }),
    );

    expect(history?.getCurrentLocation().search).toBe("");
    expect(trackContentStudioScopeChanged).toHaveBeenCalledTimes(1);
    expect(trackContentStudioScopeChanged).toHaveBeenCalledWith(null);
  });

  it("offers checking out a branch", async () => {
    const { onCheckOutBranch } = setup();

    await openBranchMenu();
    await userEvent.click(
      await screen.findByRole("option", { name: /Check out a branch/ }),
    );

    expect(onCheckOutBranch).toHaveBeenCalled();
  });

  it("shows the branch actions for the selected branch", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    expect(
      await screen.findByRole("button", { name: "Branch options" }),
    ).toBeInTheDocument();
  });

  it("does not offer branch actions on the main branch", async () => {
    setup();

    expect(await findBranchButton()).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Branch options" }),
    ).not.toBeInTheDocument();
  });

  it("cannot switch branches while a sync runs", async () => {
    const { store } = setup({ hasRemoteSyncPlugin: true });

    act(() => {
      store.dispatch(taskStarted({ taskType: "import" }));
    });

    expect(await findBranchButton()).toBeDisabled();

    await userEvent.hover(screen.getByTestId("content-studio-branch-selector"));

    expect(
      await screen.findByText("A sync is already in progress"),
    ).toBeInTheDocument();
  });
});
