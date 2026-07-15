import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { BrowseSchemas } from "./BrowseSchemas";

const setup = ({
  databases,
  initialRoute,
}: {
  databases: Database[];
  initialRoute: string;
}) => {
  setupDatabasesEndpoints(databases);
  return renderWithProviders(
    <Route path="/browse/databases/:slug" component={BrowseSchemas} />,
    { withRouter: true, initialRoute },
  );
};

const MULTI_SCHEMA_SALES = createMockDatabase({
  id: 7,
  name: "Sales",
  tables: [
    createMockTable({ id: 10, db_id: 7, schema: "PUBLIC" }),
    createMockTable({ id: 11, db_id: 7, schema: "ANALYTICS" }),
  ],
});

describe("BrowseSchemas name-based permalinks", () => {
  describe("resolving the database from the url segment", () => {
    it("shows the database's schemas under the name url, without redirecting", async () => {
      const { history } = setup({
        databases: [MULTI_SCHEMA_SALES],
        initialRoute: "/browse/databases/Sales",
      });

      expect(await screen.findByText("PUBLIC")).toBeInTheDocument();
      expect(screen.getByText("ANALYTICS")).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/Sales",
      );
    });

    it("resolves a colliding name to the lowest-id database", async () => {
      setup({
        databases: [
          createMockDatabase({
            id: 4,
            name: "Prod",
            tables: [
              createMockTable({ id: 40, db_id: 4, schema: "ALPHA" }),
              createMockTable({ id: 41, db_id: 4, schema: "BETA" }),
            ],
          }),
          createMockDatabase({
            id: 9,
            name: "Prod",
            tables: [
              createMockTable({ id: 90, db_id: 9, schema: "GAMMA" }),
              createMockTable({ id: 91, db_id: 9, schema: "DELTA" }),
            ],
          }),
        ],
        initialRoute: "/browse/databases/Prod",
      });

      expect(await screen.findByText("ALPHA")).toBeInTheDocument();
      expect(screen.queryByText("GAMMA")).not.toBeInTheDocument();
    });
  });

  describe("preserving the url form when drilling into a schema", () => {
    it("stays on the name url", async () => {
      const { history } = setup({
        databases: [MULTI_SCHEMA_SALES],
        initialRoute: "/browse/databases/Sales",
      });

      await userEvent.click(await screen.findByText("PUBLIC"));

      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/Sales/schema/PUBLIC",
      );
    });

    it("stays on the id url", async () => {
      const { history } = setup({
        databases: [MULTI_SCHEMA_SALES],
        initialRoute: "/browse/databases/7-sales",
      });

      await userEvent.click(await screen.findByText("PUBLIC"));

      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/7-sales/schema/PUBLIC",
      );
    });
  });

  describe("schema layout", () => {
    it("renders the tables inline when the database has a single schema", async () => {
      setup({
        databases: [
          createMockDatabase({
            id: 7,
            name: "Sales",
            tables: [
              createMockTable({
                id: 10,
                db_id: 7,
                schema: "PUBLIC",
                name: "orders",
                display_name: "Orders",
              }),
            ],
          }),
        ],
        initialRoute: "/browse/databases/Sales",
      });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.queryByText("PUBLIC")).not.toBeInTheDocument();
    });

    it("tells the user when the database has no tables", async () => {
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales", tables: [] })],
        initialRoute: "/browse/databases/Sales",
      });

      expect(
        await screen.findByText("This database doesn't have any tables."),
      ).toBeInTheDocument();
    });
  });

  describe("when the database can't be resolved", () => {
    it("shows a not-found page for an unknown name", async () => {
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales" })],
        initialRoute: "/browse/databases/Unknown",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });

    it("matches names case-sensitively", async () => {
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales" })],
        initialRoute: "/browse/databases/sales",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });

    it("shows an error instead of not-found when the databases request fails", async () => {
      fetchMock.get("path:/api/database", 500);
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales" })],
        initialRoute: "/browse/databases/Sales",
      });

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
      expect(screen.queryByLabelText("error page")).not.toBeInTheDocument();
    });
  });
});
