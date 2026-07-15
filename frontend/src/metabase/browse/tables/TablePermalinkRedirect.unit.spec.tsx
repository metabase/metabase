import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database, Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { TablePermalinkRedirect } from "./TablePermalinkRedirect";

const PERMALINK_PATH =
  "/browse/databases/:dbName/schema/:schemaName/table/:tableName";
const PERMALINK_PATH_NO_SCHEMA = "/browse/databases/:dbName/table/:tableName";

const setup = ({
  databases,
  tables,
  initialRoute,
}: {
  databases: Database[] | number;
  tables: Table[] | number;
  initialRoute: string;
}) => {
  if (Array.isArray(databases)) {
    setupDatabasesEndpoints(databases);
  } else {
    fetchMock.get("path:/api/database", databases);
  }
  if (Array.isArray(tables)) {
    setupTablesEndpoints(tables);
  } else {
    fetchMock.get("path:/api/table", tables);
  }

  const noSchema = !initialRoute.includes("/schema/");

  return renderWithProviders(
    <>
      <Route
        path={noSchema ? PERMALINK_PATH_NO_SCHEMA : PERMALINK_PATH}
        component={TablePermalinkRedirect}
      />
      <Route path="/table/:slug" component={() => <div>Table page</div>} />
    </>,
    { withRouter: true, initialRoute },
  );
};

const SALES = createMockDatabase({ id: 7, name: "Sales" });

describe("TablePermalinkRedirect", () => {
  describe("redirecting to the query builder", () => {
    it("redirects a table permalink to the canonical /table/:id-:slug url", async () => {
      const table = createMockTable({
        id: 10,
        db_id: 7,
        schema: "PUBLIC",
        name: "orders",
        display_name: "Orders",
      });
      const { history } = setup({
        databases: [SALES],
        tables: [table],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC/table/orders",
      });

      await waitFor(() =>
        expect(history?.getCurrentLocation().pathname).toBe("/table/10-orders"),
      );
    });

    it("redirects a schema-less table permalink (null schema)", async () => {
      const table = createMockTable({
        id: 11,
        db_id: 7,
        schema: undefined,
        name: "events",
        display_name: "Events",
      });
      const { history } = setup({
        databases: [SALES],
        tables: [table],
        initialRoute: "/browse/databases/Sales/table/events",
      });

      await waitFor(() =>
        expect(history?.getCurrentLocation().pathname).toBe("/table/11-events"),
      );
    });

    it("resolves an id-slug database segment, like the schema page links to", async () => {
      const table = createMockTable({
        id: 10,
        db_id: 7,
        schema: "PUBLIC",
        name: "orders",
        display_name: "Orders",
      });
      const { history } = setup({
        databases: [SALES],
        tables: [table],
        initialRoute: "/browse/databases/7-sales/schema/PUBLIC/table/orders",
      });

      await waitFor(() =>
        expect(history?.getCurrentLocation().pathname).toBe("/table/10-orders"),
      );
    });

    it("resolves a colliding database name to the lowest-id database's table", async () => {
      const { history } = setup({
        databases: [
          createMockDatabase({ id: 4, name: "Prod" }),
          createMockDatabase({ id: 9, name: "Prod" }),
        ],
        tables: [
          createMockTable({
            id: 40,
            db_id: 4,
            schema: "PUBLIC",
            name: "orders",
            display_name: "Orders",
          }),
          createMockTable({
            id: 90,
            db_id: 9,
            schema: "PUBLIC",
            name: "orders",
            display_name: "Orders",
          }),
        ],
        initialRoute: "/browse/databases/Prod/schema/PUBLIC/table/orders",
      });

      await waitFor(() =>
        expect(history?.getCurrentLocation().pathname).toBe("/table/40-orders"),
      );
    });
  });

  describe("matching is exact", () => {
    it("matches the table name case-sensitively (wrong case → not found)", async () => {
      const table = createMockTable({
        id: 10,
        db_id: 7,
        schema: "PUBLIC",
        name: "orders",
      });
      setup({
        databases: [SALES],
        tables: [table],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC/table/ORDERS",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });

    it("shows a not-found page for an unknown table", async () => {
      setup({
        databases: [SALES],
        tables: [],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC/table/nope",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });

    it("does not match a same-named table in a different database", async () => {
      const otherDbTable = createMockTable({
        id: 20,
        db_id: 99, // a different database than Sales (7)
        schema: "PUBLIC",
        name: "orders",
      });
      setup({
        databases: [SALES],
        tables: [otherDbTable],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC/table/orders",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });

    it("does not match a same-named table in a different schema", async () => {
      const otherSchemaTable = createMockTable({
        id: 21,
        db_id: 7,
        schema: "ANALYTICS", // a different schema than the PUBLIC in the url
        name: "orders",
      });
      setup({
        databases: [SALES],
        tables: [otherSchemaTable],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC/table/orders",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });
  });

  describe("handle failing requests", () => {
    it("shows an error instead of not-found when the databases request fails", async () => {
      setup({
        databases: 500,
        tables: [],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC/table/orders",
      });

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
      expect(screen.queryByLabelText("error page")).not.toBeInTheDocument();
    });

    it("shows an error instead of not-found when the tables request fails", async () => {
      setup({
        databases: [SALES],
        tables: 500,
        initialRoute: "/browse/databases/Sales/schema/PUBLIC/table/orders",
      });

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
      expect(screen.queryByLabelText("error page")).not.toBeInTheDocument();
    });
  });
});
