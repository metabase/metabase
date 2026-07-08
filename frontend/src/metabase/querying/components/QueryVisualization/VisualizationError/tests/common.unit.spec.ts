import { screen } from "__support__/ui";
import { StreamInterruptedError } from "metabase/api/client";
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
