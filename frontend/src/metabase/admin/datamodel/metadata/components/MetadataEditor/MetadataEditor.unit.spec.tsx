import React from "react";
import { IndexRedirect, Route } from "react-router";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { Database } from "metabase-types/api";
import {
  createOrdersTable,
  createPeopleTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from "__support__/ui";
import MetadataTableSettings from "../MetadataTableSettings";
import MetadataEditor from "./MetadataEditor";

const ORDERS_TABLE = createOrdersTable({
  visibility_type: "technical",
});

const PRODUCTS_TABLE = createPeopleTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PRODUCTS_TABLE],
});

const PEOPLE_TABLE = createPeopleTable({
  db_id: 2,
});

const REVIEWS_TABLE = createReviewsTable({
  db_id: 2,
  schema: "private",
});

const SAMPLE_DB_MULTI_SCHEMA = createSampleDatabase({
  id: 2,
  name: "Multi schema",
  tables: [PEOPLE_TABLE, REVIEWS_TABLE],
});

interface SetupOpts {
  databases?: Database[];
  initialRoute?: string;
}

const setup = async ({
  databases = [SAMPLE_DB],
  initialRoute = "admin/datamodel",
}: SetupOpts = {}) => {
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
    { withRouter: true, initialRoute },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/));
};

describe("MetadataEditor", () => {
  describe("single schema database", () => {
    it("should select the first database and the only schema by default", async () => {
      await setup();

      expect(screen.getByText(SAMPLE_DB.name)).toBeInTheDocument(); // TODO
      expect(
        screen.getByRole("listitem", { name: ORDERS_TABLE.display_name }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: ORDERS_TABLE.schema }),
      ).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup();

      const searchValue = ORDERS_TABLE.name.substring(0, 3);
      userEvent.type(screen.getByPlaceholderText("Find a table"), searchValue);

      expect(
        screen.getByRole("listitem", { name: ORDERS_TABLE.display_name }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: PRODUCTS_TABLE.display_name }),
      ).not.toBeInTheDocument();
    });

    it("should allow to switch between metadata and original schema", async () => {
      const fields = ORDERS_TABLE.fields ?? [];
      await setup();

      userEvent.click(
        screen.getByRole("listitem", { name: ORDERS_TABLE.display_name }),
      );
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue(fields[0].display_name),
      ).toBeInTheDocument();

      userEvent.click(screen.getByRole("radio", { name: "Original schema" }));
      expect(screen.getByText(ORDERS_TABLE.name)).toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings", async () => {
      await setup();

      userEvent.click(
        screen.getByRole("listitem", { name: ORDERS_TABLE.display_name }),
      );
      userEvent.click(screen.getByRole("link", { name: "Settings" }));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByRole("link", { name: SAMPLE_DB.name }));
      expect(await screen.findByText("2 Queryable Tables")).toBeInTheDocument();

      userEvent.click(
        screen.getByRole("listitem", { name: ORDERS_TABLE.display_name }),
      );
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(
        screen.getByRole("listitem", { name: ORDERS_TABLE.display_name }),
      );
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("should allow to rescan field values", async () => {
      await setup();

      userEvent.click(
        screen.getByRole("listitem", { name: ORDERS_TABLE.display_name }),
      );
      userEvent.click(screen.getByRole("link", { name: "Settings" }));
      userEvent.click(
        await screen.findByRole("button", { name: "Re-scan this table" }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/rescan_values`;
        expect(fetchMock.called(path, { method: "POST" })).toBeTruthy();
      });
    });

    it("should allow to discard field values", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(screen.getByRole("link", { name: "Settings" }));
      userEvent.click(
        await screen.findByRole("button", {
          name: "Discard cached field values",
        }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/discard_values`;
        expect(fetchMock.called(path, { method: "POST" })).toBeTruthy();
      });
    });
  });

  describe("multi schema database", () => {
    it("should not select the first schema if there are multiple schemas", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      expect(screen.getByText(SAMPLE_DB_MULTI_SCHEMA.name)).toBeInTheDocument(); // TODO
      expect(
        screen.getByRole("listitem", { name: PEOPLE_TABLE.schema }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: REVIEWS_TABLE.schema }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: PEOPLE_TABLE.display_name }),
      ).not.toBeInTheDocument();
    });

    it("should allow to search for a schema", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      const searchValue = PEOPLE_TABLE.schema.substring(0, 3);
      userEvent.type(screen.getByPlaceholderText("Find a schema"), searchValue);

      expect(
        screen.getByRole("listitem", { name: PEOPLE_TABLE.schema }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: REVIEWS_TABLE.schema }),
      ).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      userEvent.click(
        screen.getByRole("listitem", { name: PEOPLE_TABLE.schema }),
      );
      expect(
        await screen.findByRole("listitem", {
          name: PEOPLE_TABLE.display_name,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: REVIEWS_TABLE.display_name }),
      ).not.toBeInTheDocument();

      userEvent.click(screen.getByRole("link", { name: "Schemas" }));
      expect(
        screen.getByRole("listitem", { name: PEOPLE_TABLE.schema }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: REVIEWS_TABLE.schema }),
      ).toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      userEvent.click(
        screen.getByRole("listitem", { name: PEOPLE_TABLE.schema }),
      );
      userEvent.click(
        await screen.findByRole("listitem", {
          name: PEOPLE_TABLE.display_name,
        }),
      );
      userEvent.click(screen.getByRole("link", { name: "Settings" }));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(
        screen.getByRole("link", { name: SAMPLE_DB_MULTI_SCHEMA.name }),
      );
      expect(await screen.findByText("2 schemas")).toBeInTheDocument();

      userEvent.click(
        screen.getByRole("listitem", { name: PEOPLE_TABLE.schema }),
      );
      userEvent.click(
        screen.getByRole("listitem", { name: PEOPLE_TABLE.display_name }),
      );
      userEvent.click(screen.getByRole("link", { name: "Settings" }));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByRole("link", { name: PEOPLE_TABLE.schema }));
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();

      userEvent.click(
        await screen.findByRole("listitem", {
          name: PEOPLE_TABLE.display_name,
        }),
      );
      userEvent.click(screen.getByRole("link", { name: "Settings" }));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(
        screen.getByRole("link", { name: PEOPLE_TABLE.display_name }),
      );
      expect(
        await screen.findByDisplayValue(PEOPLE_TABLE.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("multiple databases", () => {
    it("should be able to switch databases", async () => {
      await setup({ databases: [SAMPLE_DB, SAMPLE_DB_MULTI_SCHEMA] });
      expect(
        await screen.findByText(ORDERS_TABLE.display_name), // TODO
      ).toBeInTheDocument();

      userEvent.click(screen.getByText(SAMPLE_DB.name)); // TODO
      userEvent.click(
        screen.getByRole("listitem", { name: SAMPLE_DB_MULTI_SCHEMA.name }),
      );
      userEvent.click(
        await screen.findByRole("listitem", { name: PEOPLE_TABLE.schema }),
      );
      expect(
        await screen.findByRole("listitem", {
          name: PEOPLE_TABLE.display_name,
        }),
      ).toBeInTheDocument();
    });
  });

  describe("no databases", () => {
    it("should display an empty state", async () => {
      await setup({ databases: [] });

      expect(
        screen.getByText("The page you asked for couldn't be found."),
      ).toBeInTheDocument();
    });
  });
});
