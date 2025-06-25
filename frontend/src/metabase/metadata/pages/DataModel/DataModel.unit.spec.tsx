import { IndexRedirect, Route } from "react-router";

import {
  setupCardDataset,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import { SAMPLE_DATABASE } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";

import { DataModel } from "./DataModel";
import type { ParsedRouteParams } from "./types";
import { getUrl } from "./utils";

registerVisualizations();

const DEFAULT_ROUTE_PARAMS: ParsedRouteParams = {
  databaseId: undefined,
  schemaName: undefined,
  tableId: undefined,
  fieldId: undefined,
};

interface SetupOpts {
  databases?: Database[];
  params?: ParsedRouteParams;
}

function setup({
  databases = [SAMPLE_DATABASE],
  params = DEFAULT_ROUTE_PARAMS,
}: SetupOpts = {}) {
  setupDatabasesEndpoints(databases);
  setupCardDataset();

  renderWithProviders(
    <Route path="admin/datamodel">
      <IndexRedirect to="database" />
      <Route path="database" component={DataModel} />
      <Route path="database/:databaseId" component={DataModel} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
        component={DataModel}
      />
    </Route>,
    {
      withRouter: true,
      initialRoute: getUrl(params),
    },
  );
}

describe("DataModel", () => {
  it("should work", async () => {
    setup();

    expect(
      screen.getByText("Start by selecting data to model"),
    ).toBeInTheDocument();
  });
});
