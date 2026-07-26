import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import {
  createMockUserInfo,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { WorkspaceTable } from "./WorkspaceTable";

const WORKSPACES: Workspace[] = [
  createMockWorkspace({
    id: 10,
    branch: "feature/joined",
    creator: createMockUserInfo({ id: 1 }),
    users: [createMockUserInfo({ id: 1 })],
  }),
];

function setup(workspaces: Workspace[] = WORKSPACES) {
  mockGetBoundingClientRect({ width: 800, height: 600 });
  renderWithProviders(<WorkspaceTable workspaces={workspaces} />);
}

describe("WorkspaceTable", () => {
  it("should render a row for each workspace with its branch, creator, and users", async () => {
    setup();

    const row = await screen.findByRole("row", { name: "feature/joined" });
    expect(row).toBeInTheDocument();
    expect(screen.getAllByText("Testy Tableton")).toHaveLength(2);
  });
});
