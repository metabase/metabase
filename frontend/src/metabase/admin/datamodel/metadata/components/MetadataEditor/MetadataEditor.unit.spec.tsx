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
        path="database/:databaseId/schema/:schemaId"
        component={MetadataEditor}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        component={MetadataEditor}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        component={MetadataTableSettings}
      />
    </Route>,
    { withRouter: true, initialRoute: "admin/datamodel" },
  );

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/));
};

describe("MetadataEditor", () => {
  it("should select the first database and the only schema by default", async () => {
    await setup();

    expect(screen.getByText("Sample Database")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("PUBLIC")).not.toBeInTheDocument();
  });

  it("should allow to search for a table", async () => {
    await setup();

    userEvent.type(screen.getByPlaceholderText("Find a table"), "Ord");
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();

    userEvent.click(screen.getByText("Orders"));
    expect(await screen.findByDisplayValue("Orders")).toBeInTheDocument();
  });

  it("should allow to change the title of a table", async () => {
    await setup();

    userEvent.click(screen.getByText("Orders"));
    userEvent.type(await screen.findByDisplayValue("Orders"), "2");
    userEvent.tab();

    expect(await screen.findByText("Orders2")).toBeInTheDocument();
  });
});
