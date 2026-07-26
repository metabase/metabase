import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockRemoteSyncWorktree,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { WorktreeTable } from "./WorktreeTable";

const WORKTREES: RemoteSyncWorktree[] = [
  createMockRemoteSyncWorktree({
    id: 10,
    branch: "feature/joined",
    creator: createMockUserInfo({ id: 1 }),
    users: [createMockUserInfo({ id: 1 })],
  }),
];

function setup(worktrees: RemoteSyncWorktree[] = WORKTREES) {
  mockGetBoundingClientRect({ width: 800, height: 600 });
  renderWithProviders(<WorktreeTable worktrees={worktrees} />);
}

describe("WorktreeTable", () => {
  it("should render a row for each worktree with its branch, creator, and users", async () => {
    setup();

    const row = await screen.findByRole("row", { name: "feature/joined" });
    expect(row).toBeInTheDocument();
    expect(screen.getAllByText("Testy Tableton")).toHaveLength(2);
  });
});
