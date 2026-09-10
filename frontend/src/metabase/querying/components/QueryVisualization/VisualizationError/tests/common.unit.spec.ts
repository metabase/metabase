import { screen } from "__support__/ui";
import { StreamInterruptedError } from "metabase/api/client";
import type { DatasetError } from "metabase-types/api";
import { createMockCard, createMockDatabase } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("VisualizationError (OSS)", () => {
  describe("interrupted stream", () => {
    it("shows a query-didn't-finish message, not a connectivity/server-issues one", () => {
      setup({ error: new StreamInterruptedError("network error") });

      expect(
        screen.getByText("This question didn't finish loading"),
      ).toBeInTheDocument();
      // It must not be misattributed to a server outage / connectivity problem
      expect(
        screen.queryByText("We're experiencing server issues"),
      ).not.toBeInTheDocument();
      // ...and the raw transport message is not leaked to the user
      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });
  });

  describe("SQL databases", () => {
    const database = createMockDatabase({
      engine: "postgres",
    });

    it("should show a SQL help link when `show-metabase-links: true`", () => {
      const card = createMockCard({
        dataset_query: {
          database: database.id,
          type: "native",
          native: {
            query: "SELECT * FROM ORDERS",
          },
        },
      });
      setup({ database, card, showMetabaseLinks: true });

      expect(
        screen.getByText("Learn how to debug SQL errors"),
      ).toBeInTheDocument();
    });

    it("should show a SQL help link when `show-metabase-links: false`", () => {
      const card = createMockCard({
        dataset_query: {
          database: database.id,
          type: "native",
          native: {
            query: "SELECT * FROM ORDERS",
          },
        },
      });
      setup({ database, card, showMetabaseLinks: false });

      expect(
        screen.getByText("Learn how to debug SQL errors"),
      ).toBeInTheDocument();
    });
  });

  describe("server errors", () => {
    // A failed query arrives as { status, data }, data being the response body.
    const createServerError = (data: unknown): DatasetError => ({
      status: 500,
      data,
    });

    const database = createMockDatabase({ engine: "postgres" });
    const card = createMockCard({
      dataset_query: {
        database: database.id,
        type: "native",
        native: { query: "SELECT * FROM ORDERS" },
      },
    });

    it("shows the message from a 500 whose payload carries one the same way as for 4xx", () => {
      const message =
        "Too many query parameters: 13444 exceeds limit of 10000.";
      setup({
        database,
        card,
        error: createServerError({ status: "failed", error: message }),
      });

      expect(
        screen.getByText("An error occurred in your query"),
      ).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(
        screen.queryByText("We're experiencing server issues"),
      ).not.toBeInTheDocument();
    });

    it("falls back to the generic server-issues card when a 500 carries no usable message", () => {
      setup({
        database,
        card,
        error: createServerError("<html>Internal Server Error</html>"),
      });

      expect(
        screen.getByText("We're experiencing server issues"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("An error occurred in your query"),
      ).not.toBeInTheDocument();
    });
  });

  describe("NoSQL databases", () => {
    const database = createMockDatabase({
      engine: "mongo",
    });

    it("should not show a SQL help link", () => {
      const card = createMockCard({
        dataset_query: {
          database: database.id,
          type: "native",
          native: {
            query: "[]",
          },
        },
      });
      setup({ database, card });

      expect(
        screen.queryByText("Learn how to debug SQL errors"),
      ).not.toBeInTheDocument();
    });
  });
});
