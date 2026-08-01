import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupRemoteSyncEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { reinitialize } from "metabase/plugins";
import {
  createMockDashboardState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockRemoteSyncWorktree,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { BranchEntityBanner } from "./BranchEntityBanner";

const WORKTREE = createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" });

const BRANCH_COLLECTION = createMockCollection({
  id: 11,
  name: "Analytics",
  worktree_id: WORKTREE.id,
});

const BRANCH_DASHBOARD = createMockDashboard({
  id: 3,
  name: "Overview",
  collection_id: BRANCH_COLLECTION.id,
  worktree_id: WORKTREE.id,
});

const MAIN_DASHBOARD = createMockDashboard({
  id: 4,
  name: "Overview",
  collection_id: BRANCH_COLLECTION.id,
});

async function setup(dashboard: Dashboard) {
  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([]);
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({}),
  );
  setupCollectionsEndpoints({ collections: [BRANCH_COLLECTION] });
  setupCollectionByIdEndpoint({ collections: [BRANCH_COLLECTION] });
  setupBookmarksEndpoints([]);
  setupSearchEndpoints([]);
  setupRemoteSyncEndpoints({ worktrees: [WORKTREE] });

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    dashboard: createMockDashboardState(),
    settings: mockSettings({
      "remote-sync-enabled": true,
      "remote-sync-branch": "main",
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
  });

  setupEnterpriseOnlyPlugin("remote_sync");
  setupEnterpriseOnlyPlugin("content_studio");

  renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${dashboard.id}`,
      withRouter: true,
      storeInitialState,
    },
  );

  await waitForLoaderToBeRemoved();
}

describe("BranchEntityBanner", () => {
  afterEach(() => {
    reinitialize();
  });

  it("names the branch a dashboard is on and links back to Content Studio", async () => {
    await setup(BRANCH_DASHBOARD);

    const banner = await screen.findByTestId("branch-entity-banner");
    expect(banner).toHaveTextContent(
      "This dashboard is on the feature-a branch.",
    );
    expect(
      screen.getByRole("link", { name: "Open in Content Studio" }),
    ).toHaveAttribute("href", "/content-studio/collection/11");
  });

  it("stays hidden for a dashboard outside a branch", async () => {
    await setup(MAIN_DASHBOARD);

    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(
      screen.queryByTestId("branch-entity-banner"),
    ).not.toBeInTheDocument();
  });

  it("names the branch a document is on", async () => {
    setupRemoteSyncEndpoints({ worktrees: [WORKTREE] });

    renderWithProviders(
      <BranchEntityBanner
        entityType="document"
        worktreeId={WORKTREE.id}
        collectionId={BRANCH_COLLECTION.id}
      />,
      {
        storeInitialState: createMockState({
          currentUser: createMockUser({ is_superuser: true }),
          settings: mockSettings({ "remote-sync-enabled": true }),
        }),
      },
    );

    expect(await screen.findByTestId("branch-entity-banner")).toHaveTextContent(
      "This document is on the feature-a branch.",
    );
  });
});
