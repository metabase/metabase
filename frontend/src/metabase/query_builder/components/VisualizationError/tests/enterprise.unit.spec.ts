import { screen } from "__support__/ui";
import { createMockCard, createMockDatabase } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("VisualizationError (EE without token)", () => {
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
