import fetchMock from "fetch-mock";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { BrowseTables } from "./BrowseTables";

const setup = ({
  databases,
  initialRoute,
}: {
  databases: Database[];
  initialRoute: string;
}) => {
  setupDatabasesEndpoints(databases);
  return renderWithProviders(
    <Route
      path="/browse/databases/:dbId/schema/:schemaName"
      component={BrowseTables}
    />,
    { withRouter: true, initialRoute },
  );
};

const SINGLE_TABLE_SALES = (dbId: number, name: string) =>
  createMockDatabase({
    id: dbId,
    name,
    tables: [
      createMockTable({
        id: dbId * 10,
        db_id: dbId,
        schema: "PUBLIC",
        name: "orders",
        display_name: "Orders",
      }),
    ],
  });

describe("BrowseTables name-based schema permalinks", () => {
  describe("resolving the database from the url segment", () => {
    it("renders the schema browse page in place, keeping the name url", async () => {
      const { history } = setup({
        databases: [SINGLE_TABLE_SALES(7, "Sales")],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC",
      });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/Sales/schema/PUBLIC",
      );
    });

    it("resolves an id-slug database segment", async () => {
      setup({
        databases: [SINGLE_TABLE_SALES(7, "Sales")],
        initialRoute: "/browse/databases/7-sales/schema/PUBLIC",
      });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
    });

    it("resolves a colliding database name to the lowest-id database", async () => {
      setup({
        databases: [
          createMockDatabase({
            id: 4,
            name: "Prod",
            tables: [
              createMockTable({
                id: 40,
                db_id: 4,
                schema: "PUBLIC",
                name: "orders",
                display_name: "Orders in db 4",
              }),
            ],
          }),
          createMockDatabase({
            id: 9,
            name: "Prod",
            tables: [
              createMockTable({
                id: 90,
                db_id: 9,
                schema: "PUBLIC",
                name: "orders",
                display_name: "Orders in db 9",
              }),
            ],
          }),
        ],
        initialRoute: "/browse/databases/Prod/schema/PUBLIC",
      });

      expect(await screen.findByText("Orders in db 4")).toBeInTheDocument();
      expect(screen.queryByText("Orders in db 9")).not.toBeInTheDocument();
    });
  });

  describe("when the database can't be resolved", () => {
    it("shows a not-found page for an unknown database name", async () => {
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales" })],
        initialRoute: "/browse/databases/Unknown/schema/PUBLIC",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });

    it("matches the database name case-sensitively", async () => {
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales" })],
        initialRoute: "/browse/databases/sales/schema/PUBLIC",
      });

      expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    });

    it("shows an error instead of not-found when the databases request fails", async () => {
      fetchMock.get("path:/api/database", 500);
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales" })],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC",
      });

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
      expect(screen.queryByLabelText("error page")).not.toBeInTheDocument();
    });
  });

  describe("when the schema's tables can't be read", () => {
    it("shows an error when the user can see the database but not the schema's tables", async () => {
      // A schema with no tables the user may read is a 404 from the tables
      // endpoint (api/check-404), which surfaces as a generic error.
      fetchMock.get("path:/api/database/7/schema/PUBLIC", 404);
      setup({
        databases: [createMockDatabase({ id: 7, name: "Sales" })],
        initialRoute: "/browse/databases/Sales/schema/PUBLIC",
      });

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
      expect(screen.queryByLabelText("error page")).not.toBeInTheDocument();
    });
  });
});
