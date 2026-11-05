import {
  setupActionEndpoints,
  setupDataAppEndpoint,
  setupDatabaseListEndpoint,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { WritebackImplicitQueryAction } from "metabase-types/api";
import {
  createMockDataApp,
  createMockDatabase,
  createMockField,
  createMockImplicitQueryAction,
  createMockTable,
} from "metabase-types/api/mocks";

import { DataAppActionDefinitionPage } from "./DataAppActionDefinitionPage";

const APP = createMockDataApp({ name: "teams" });

const DATABASE = createMockDatabase({
  id: 1,
  name: "Shop",
  settings: { "database-enable-actions": true },
});

const TABLE = createMockTable({
  id: 10,
  db_id: 1,
  db: DATABASE,
  schema: "public",
  display_name: "Teams",
  fields: [
    createMockField({
      id: 100,
      table_id: 10,
      name: "ID",
      semantic_type: "type/PK",
    }),
  ],
});

type SetupOpts = {
  action: WritebackImplicitQueryAction;
};

function setup({ action }: SetupOpts) {
  setupDataAppEndpoint(APP);
  setupActionEndpoints(action);
  setupTableQueryMetadataEndpoint(TABLE);
  setupDatabaseListEndpoint([DATABASE]);

  renderWithProviders(
    <Route
      path="/data-studio/apps/:name/actions/:actionId"
      element={<DataAppActionDefinitionPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/apps/${APP.name}/actions/${action.id}`,
    },
  );
}

describe("DataAppActionDefinitionPage", () => {
  it("shows the table and the operation of an app's table action, read-only", async () => {
    setup({
      action: createMockImplicitQueryAction({
        id: 2,
        name: "addTeam",
        model_id: null,
        table_id: TABLE.id,
        kind: "row/create",
        can_write: false,
      }),
    });

    expect(await screen.findByText("Teams")).toBeInTheDocument();
    expect(screen.getByTestId("data-app-action-header")).toHaveTextContent(
      "addTeam",
    );
    expect(
      screen.getByText(
        "Adds a new row. The form asks for every column the database does not fill in.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change table" }),
    ).not.toBeInTheDocument();
  });
});
