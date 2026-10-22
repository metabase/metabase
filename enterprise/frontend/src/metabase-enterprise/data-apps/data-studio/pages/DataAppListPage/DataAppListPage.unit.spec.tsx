import { setupListDataAppsEndpoint } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppListPage } from "./DataAppListPage";

type SetupOpts = {
  apps: DataApp[];
};

function setup({ apps }: SetupOpts) {
  setupListDataAppsEndpoint(apps);
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

  it("explains how to create a data app when there are none", async () => {
    setup({ apps: [] });

    expect(
      await screen.findByText(
        "Use the mb CLI to create a data app. Deploy it to your production instance with Remote Sync.",
      ),
    ).toBeInTheDocument();
  });
});
