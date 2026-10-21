import {
  setupDataAppRepoStatusEndpoint,
  setupListDataAppsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { DataApp, DataAppRepoStatus } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { INSTALL_SKILL_COMMAND } from "../../../constants";

import { DataAppListPage } from "./DataAppListPage";

type SetupOpts = {
  apps: DataApp[];
  repoStatus?: DataAppRepoStatus;
};

function setup({
  apps,
  repoStatus = { configured: true, url: "https://example.com/repo.git" },
}: SetupOpts) {
  setupListDataAppsEndpoint(apps);
  setupDataAppRepoStatusEndpoint(repoStatus);
  renderWithProviders(<DataAppListPage />, { withRouter: true });
}

describe("DataAppListPage", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("lists the apps with their address and status", async () => {
    setup({
      apps: [
        createMockDataApp({
          name: "order-desk",
          display_name: "Order desk",
          enabled: true,
        }),
        createMockDataApp({
          id: 2,
          name: "inventory",
          display_name: "Inventory",
          enabled: true,
          outdated: true,
        }),
      ],
    });

    expect(await screen.findByText("Order desk")).toBeInTheDocument();
    expect(screen.getByText("/apps/order-desk")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Live, outdated")).toBeInTheDocument();
  });

  it("asks to set up Git sync when there are no apps and no repository", async () => {
    setup({ apps: [], repoStatus: { configured: false, url: null } });

    expect(
      await screen.findByRole("link", { name: "Set up Git sync" }),
    ).toHaveAttribute("href", "/admin/settings/remote-sync");
    expect(screen.queryByLabelText("Install command")).not.toBeInTheDocument();
  });

  it("shows the skill install command when there are no apps and a repository is connected", async () => {
    setup({ apps: [] });

    expect(await screen.findByLabelText("Install command")).toHaveValue(
      INSTALL_SKILL_COMMAND,
    );
    expect(
      screen.queryByRole("link", { name: "Set up Git sync" }),
    ).not.toBeInTheDocument();
  });
});
