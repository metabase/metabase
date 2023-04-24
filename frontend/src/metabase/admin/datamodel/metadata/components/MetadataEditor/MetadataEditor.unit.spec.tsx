import React from "react";
import { IndexRedirect, Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
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

const TEST_TABLE_1 = createMockTable({
  id: 1,
  name: "Orders",
  schema: "PUBLIC",
});

const TEST_TABLE_2 = createMockTable({
  id: 2,
  name: "People",
  schema: "PUBLIC",
});

const TEST_TABLE_3 = createMockTable({
  id: 3,
  name: "People",
  schema: "PUBLIC",
});

const TEST_TABLE_4 = createMockTable({
  id: 4,
  name: "People",
  schema: "PUBLIC",
});

const TEST_TABLE_5 = createMockTable({
  id: 5,
  name: "People",
  schema: "PRIVATE",
});

const TEST_DB = createMockDatabase({
  id: 1,
  name: "One schema",
  tables: [TEST_TABLE_1, TEST_TABLE_2],
});

const TEST_MULTI_SCHEMA_DB = createMockDatabase({
  id: 2,
  name: "Multi schema",
  tables: [TEST_TABLE_3, TEST_TABLE_4, TEST_TABLE_5],
});

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

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE_1.display_name)).toBeInTheDocument();
    expect(screen.queryByText(TEST_TABLE_1.schema)).not.toBeInTheDocument();
  });

  it("should not select the first schema if there are multiple schemas", async () => {
    await setup({ databases: [TEST_MULTI_SCHEMA_DB] });

    expect(screen.getByText(TEST_MULTI_SCHEMA_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE_4.schema)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE_5.schema)).toBeInTheDocument();
  });

  it("should allow to search for a table", async () => {
    await setup();

    const searchValue = TEST_TABLE_1.name.substring(0, 3);
    userEvent.type(screen.getByPlaceholderText("Find a table"), searchValue);

    expect(screen.getByText(TEST_TABLE_1.name)).toBeInTheDocument();
    expect(screen.queryByText(TEST_TABLE_2.name)).not.toBeInTheDocument();
  });

  it("should allow to change the title of a table", async () => {
    await setup();
    userEvent.click(screen.getByText(TEST_TABLE_1.display_name));

    const input = await screen.findByDisplayValue(TEST_TABLE_1.display_name);
    userEvent.clear(input);
    userEvent.type(input, "New");
    userEvent.tab();

    expect(await screen.findByText("New")).toBeInTheDocument();
  });
});
