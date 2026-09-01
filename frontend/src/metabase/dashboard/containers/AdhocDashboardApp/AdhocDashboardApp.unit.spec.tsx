import {
  setupCardDataset,
  setupDatabaseListEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { utf8_to_b64 } from "metabase/utils/encoding";
import { registerVisualizations } from "metabase/visualizations/register";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { AdhocDashboardApp } from "./AdhocDashboardApp";

registerVisualizations();

const definition = {
  name: "Ops overview",
  description: "Key ops charts.",
  tiles: [
    {
      title: "Venues by price",
      display: "bar",
      dataset_query: createMockStructuredDatasetQuery({ database: 1 }),
      row: 0,
      col: 0,
      size_x: 12,
      size_y: 6,
    },
    {
      title: "All venues",
      display: "table",
      dataset_query: createMockStructuredDatasetQuery({ database: 2 }),
      row: 0,
      col: 12,
      size_x: 12,
      size_y: 6,
    },
  ],
};

const setup = () => {
  setupCardDataset();
  setupDatabaseListEndpoint([]);

  renderWithProviders(
    <Route path="/dashboard/adhoc" element={<AdhocDashboardApp />} />,
    {
      withRouter: true,
      initialRoute: `/dashboard/adhoc#${utf8_to_b64(JSON.stringify(definition))}`,
      storeInitialState: {
        dashboard: createMockDashboardState(),
      },
    },
  );
};

describe("AdhocDashboardApp", () => {
  it("renders the hash-encoded dashboard through the dashboard system", async () => {
    setup();

    expect(await screen.findByText("Ops overview")).toBeInTheDocument();
    expect(screen.getByText("Key ops charts.")).toBeInTheDocument();
    expect(await screen.findByText("Venues by price")).toBeInTheDocument();
    expect(await screen.findByText("All venues")).toBeInTheDocument();
  });
});
