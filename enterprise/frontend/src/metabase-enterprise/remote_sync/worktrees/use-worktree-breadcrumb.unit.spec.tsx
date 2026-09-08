import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { WorktreeProvider } from "metabase/common/worktrees";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockTokenFeatures,
  createMockUser,
  createMockWorktree,
} from "metabase-types/api/mocks";

const WORKTREE = createMockWorktree({ id: 5, branch: "feature-branch" });

function setup({ insideWorktree = true }: { insideWorktree?: boolean } = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });
  setupEnterprisePlugins();
  fetchMock.get(`path:/api/ee/remote-sync/worktree/${WORKTREE.id}`, WORKTREE);

  const breadcrumbs = (
    <DataStudioBreadcrumbs>
      <a href="/transforms">Transforms</a>
      New transform
    </DataStudioBreadcrumbs>
  );

  renderWithProviders(
    insideWorktree ? (
      <WorktreeProvider worktreeId={WORKTREE.id}>
        {breadcrumbs}
      </WorktreeProvider>
    ) : (
      breadcrumbs
    ),
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings,
      }),
      withRouter: true,
    },
  );
}

describe("useWorktreeBreadcrumb", () => {
  it("prepends the worktree branch linking to the worktree's transforms list", async () => {
    setup();

    const branchItem = await screen.findByTestId("worktree-breadcrumb");
    expect(branchItem).toHaveTextContent("feature-branch");
    expect(branchItem).toHaveAttribute(
      "href",
      "/data-studio/worktrees/5/transforms",
    );

    expect(screen.getByTestId("data-studio-breadcrumbs")).toHaveTextContent(
      /feature-branch.*Transforms.*New transform/,
    );
  });

  it("shows no branch item outside a worktree", async () => {
    setup({ insideWorktree: false });

    await screen.findByText("Transforms");
    await waitFor(() => {
      expect(
        screen.queryByTestId("worktree-breadcrumb"),
      ).not.toBeInTheDocument();
    });
  });
});
