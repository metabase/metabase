import React from "react";
import { IndexRedirect, Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { Database } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import MetadataTableSettings from "../MetadataTableSettings";
import MetadataEditor from "./MetadataEditor";

const TEST_DB = createSampleDatabase();

interface SetupOpts {
  databases?: Database[];
}

const setup = async ({ databases = [TEST_DB] }: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);
  setupSearchEndpoints([]);

  renderWithProviders(
    <Route path="admin/datamodel">
      <IndexRedirect to="database" />
      <Route path="database" component={MetadataEditor} />
      <Route path="database/:databaseId" component={MetadataEditor} />
      <Route
        path="database/:databaseId/schema/:schemaName"
        component={MetadataEditor}
      />
      <Route
        path="database/:databaseId/schema/:schemaName/table/:tableId"
        component={MetadataEditor}
      />
      <Route
        path="database/:databaseId/schema/:schemaName/table/:tableId/settings"
        component={MetadataTableSettings}
      />
    </Route>,
    { withRouter: true, initialRoute: "admin/datamodel" },
  );

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/));
};

describe("MetadataEditor", () => {
  it("should be able switch between tables and view fields", async () => {
    await setup();

    userEvent.click(screen.getByText("Orders"));
    expect(await screen.findByText("TOTAL")).toBeInTheDocument();

    userEvent.click(screen.getByText("People"));
    expect(await screen.findByText("EMAIL")).toBeInTheDocument();
  });
});
