import userEvent from "@testing-library/user-event";

import {
  setupListWorktreesEndpoint,
  setupRemoteSyncBranchesEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockRemoteSyncWorktree,
  createMockUser,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { WorktreeSettings } from "./WorktreeSettings";

const CURRENT_USER = createMockUser({ id: 1, worktree_id: 10 });

const WORKTREES: RemoteSyncWorktree[] = [
  createMockRemoteSyncWorktree({
    id: 10,
    branch: "feature/joined",
    creator: createMockUserInfo({ id: 1 }),
    users: [createMockUserInfo({ id: 1 })],
  }),
  createMockRemoteSyncWorktree({
    id: 20,
    branch: "feature/not-joined",
    creator: createMockUserInfo({
      id: 2,
      first_name: "Other",
      last_name: "User",
      common_name: "Other User",
    }),
    users: [],
  }),
];

async function setup({
  worktrees = WORKTREES,
  currentUser = CURRENT_USER,
}: {
  worktrees?: RemoteSyncWorktree[];
  currentUser?: typeof CURRENT_USER;
} = {}) {
  mockGetBoundingClientRect({ width: 800, height: 600 });
  setupListWorktreesEndpoint(worktrees);
  setupUserEndpoints(currentUser);
  setupRemoteSyncBranchesEndpoint([]);

  renderWithProviders(<WorktreeSettings />, {
    storeInitialState: createMockState({ currentUser }),
  });

  await waitForLoaderToBeRemoved();
}

describe("WorktreeSettings", () => {
  it("should render worktree rows with branch, creator, and users", async () => {
    await setup();

    expect(await screen.findByText("feature/joined")).toBeInTheDocument();
    expect(screen.getByText("feature/not-joined")).toBeInTheDocument();
    expect(screen.getByText("Other User")).toBeInTheDocument();
  });

  it("should render the empty state when there are no worktrees", async () => {
    await setup({ worktrees: [] });
    expect(screen.getByText("No worktrees yet")).toBeInTheDocument();
  });

  it("should open the create worktree modal", async () => {
    await setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Create a worktree" }),
    );

    expect(
      await screen.findByRole("dialog", { name: /create a worktree/i }),
    ).toBeInTheDocument();
  });
});
