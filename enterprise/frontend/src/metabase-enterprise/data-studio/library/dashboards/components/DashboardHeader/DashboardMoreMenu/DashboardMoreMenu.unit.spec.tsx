import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupBookmarksEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { DashboardMoreMenu } from "./DashboardMoreMenu";

type SetupOpts = {
  dashboard: Dashboard;
  isAdmin?: boolean;
  isRemoteSyncReadOnly?: boolean;
};

function setup({
  dashboard,
  isAdmin = false,
  isRemoteSyncReadOnly = false,
}: SetupOpts) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ content_verification: true }),
    "remote-sync-enabled": isRemoteSyncReadOnly,
    "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : undefined,
  });
  setupEnterpriseOnlyPlugin("moderation");
  setupBookmarksEndpoints([]);

  renderWithProviders(<DashboardMoreMenu dashboard={dashboard} />, {
    storeInitialState: createMockState({
      settings,
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
}

async function getMenuItemLabels() {
  await userEvent.click(screen.getByRole("button", { name: "More options" }));
  const items = await screen.findAllByRole("menuitem");
  return items.map((item) => item.textContent);
}

describe("DashboardMoreMenu", () => {
  it("offers every action on a dashboard the user can edit", async () => {
    setup({
      dashboard: createMockDashboard({ can_write: true }),
      isAdmin: true,
    });

    expect(await getMenuItemLabels()).toEqual([
      "Bookmark",
      "Verify this dashboard",
      "Move",
      "Duplicate",
      "Move to trash",
    ]);
  });

  it("offers only bookmarking and duplicating a dashboard the user cannot edit", async () => {
    setup({ dashboard: createMockDashboard({ can_write: false }) });

    expect(await getMenuItemLabels()).toEqual(["Bookmark", "Duplicate"]);
  });

  it("offers no Verify to an admin who cannot write the dashboard", async () => {
    setup({
      dashboard: createMockDashboard({ can_write: false }),
      isAdmin: true,
    });

    expect(await getMenuItemLabels()).toEqual(["Bookmark", "Duplicate"]);
  });

  it("keeps Verify and Duplicate and drops the edits when remote sync is read-only", async () => {
    setup({
      dashboard: createMockDashboard({ can_write: true }),
      isAdmin: true,
      isRemoteSyncReadOnly: true,
    });

    expect(await getMenuItemLabels()).toEqual([
      "Bookmark",
      "Verify this dashboard",
      "Duplicate",
    ]);
  });

  it("is hidden on a trashed dashboard, whose banner offers its actions", () => {
    setup({
      dashboard: createMockDashboard({ can_write: true, archived: true }),
      isAdmin: true,
    });

    expect(
      screen.queryByRole("button", { name: "More options" }),
    ).not.toBeInTheDocument();
  });
});
