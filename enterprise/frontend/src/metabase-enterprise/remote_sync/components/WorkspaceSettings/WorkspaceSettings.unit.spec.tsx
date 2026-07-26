import userEvent from "@testing-library/user-event";

import {
  setupListWorkspacesEndpoint,
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
import type { Workspace } from "metabase-types/api";
import {
  createMockUser,
  createMockUserInfo,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { WorkspaceSettings } from "./WorkspaceSettings";

const CURRENT_USER = createMockUser({ id: 1, workspace_id: 10 });

const WORKSPACES: Workspace[] = [
  createMockWorkspace({
    id: 10,
    branch: "feature/joined",
    creator: createMockUserInfo({ id: 1 }),
    users: [createMockUserInfo({ id: 1 })],
  }),
  createMockWorkspace({
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
  workspaces = WORKSPACES,
  currentUser = CURRENT_USER,
}: {
  workspaces?: Workspace[];
  currentUser?: typeof CURRENT_USER;
} = {}) {
  mockGetBoundingClientRect({ width: 800, height: 600 });
  setupListWorkspacesEndpoint(workspaces);
  setupUserEndpoints(currentUser);
  setupRemoteSyncBranchesEndpoint([]);

  renderWithProviders(<WorkspaceSettings />, {
    storeInitialState: createMockState({ currentUser }),
  });

  await waitForLoaderToBeRemoved();
}

describe("WorkspaceSettings", () => {
  it("should render workspace rows with branch, creator, and users", async () => {
    await setup();

    expect(await screen.findByText("feature/joined")).toBeInTheDocument();
    expect(screen.getByText("feature/not-joined")).toBeInTheDocument();
    expect(screen.getByText("Other User")).toBeInTheDocument();
  });

  it("should render the empty state when there are no workspaces", async () => {
    await setup({ workspaces: [] });
    expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
  });

  it("should open the create workspace modal", async () => {
    await setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Create a workspace" }),
    );

    expect(
      await screen.findByRole("dialog", { name: /create a workspace/i }),
    ).toBeInTheDocument();
  });
});
