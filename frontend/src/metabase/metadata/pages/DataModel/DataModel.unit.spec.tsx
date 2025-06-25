import type { Location } from "history";

import {
  setupCardDataset,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import { SAMPLE_DATABASE } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import { createMockLocation } from "metabase-types/store/mocks";

import { DataModel } from "./DataModel";
import type { RouteParams } from "./types";

registerVisualizations();

interface SetupOpts {
  databases?: Database[];
  location?: Location;
  params?: RouteParams;
}

function setup({
  databases = [SAMPLE_DATABASE],
  location = createMockLocation({ pathname: "/admin/datamodel" }),
  params = {},
}: SetupOpts = {}) {
  setupDatabasesEndpoints(databases);
  setupCardDataset();

  renderWithProviders(<DataModel location={location} params={params} />);
}

describe("DataModel", () => {
  it("should work", async () => {
    setup();

    expect(
      screen.getByText("Start by selecting data to model"),
    ).toBeInTheDocument();
  });
});
