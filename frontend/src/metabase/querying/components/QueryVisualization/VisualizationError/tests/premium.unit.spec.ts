import { createMockMetadata } from "__support__/metadata";
import { screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import { createMockCard, createMockDatabase } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    tokenFeatures: { whitelabel: true },
    enterprisePlugins: ["whitelabel"],
    ...opts,
  });
}

function createNativeCard(database: Database, query: string) {
  const metadata = createMockMetadata({ databases: [database] });
  const provider = createMetadataProvider({
    databaseId: database.id,
    metadata,
  });
  return createMockCard({
    dataset_query: Lib.createTestJsNativeQuery(provider, { query }),
    query_type: "native",
  });
}

describe("VisualizationError (EE with token)", () => {
  describe("SQL databases", () => {
    const database = createMockDatabase({
      engine: "postgres",
    });

    it("should show a SQL help link when `show-metabase-links: true`", () => {
      const card = createNativeCard(database, "SELECT * FROM ORDERS");
      setup({ database, card, showMetabaseLinks: true });

      expect(
        screen.getByText("Learn how to debug SQL errors"),
      ).toBeInTheDocument();
    });

    it("should not show a SQL help link when `show-metabase-links: false`", () => {
      const card = createNativeCard(database, "SELECT * FROM ORDERS");
      setup({ database, card, showMetabaseLinks: false });

      expect(
        screen.queryByText("Learn how to debug SQL errors"),
      ).not.toBeInTheDocument();
    });
  });

  describe("NoSQL databases", () => {
    const database = createMockDatabase({
      engine: "mongo",
    });

    it("should not show a SQL help link", () => {
      const card = createNativeCard(database, "[]");
      setup({ database, card });

      expect(
        screen.queryByText("Learn how to debug SQL errors"),
      ).not.toBeInTheDocument();
    });
  });
});
