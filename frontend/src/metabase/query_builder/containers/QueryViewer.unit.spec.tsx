import React from "react";

import { createMockEntitiesState } from "__support__/store";
import { setupDatabasesEndpoints } from "__support__/server-mocks/database";
import { setupSearchEndpoints } from "__support__/server-mocks/search";
import { renderWithProviders, screen, getIcon } from "__support__/ui";

import type { DatasetQuery } from "metabase-types/api";
import {
  createMockStructuredDatasetQuery,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import QueryViewer from "./QueryViewer";

const makeQuery = (options: any) => {
  return createMockStructuredDatasetQuery({
    query: options,
    // we have to cast this because we have 2 incompatible DatasetQuery types
  }) as DatasetQuery;
};

const setup = ({ query }: { query: DatasetQuery }) => {
  const database = createSampleDatabase();
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);

  renderWithProviders(<QueryViewer datasetQuery={query as DatasetQuery} />, {
    storeInitialState: state,
  });
};

describe("Query Builder > Query Viewer", () => {
  describe("structured queries", () => {
    it("shows a complex notebook query", async () => {
      const query = makeQuery({
        "source-table": 1,
        filter: [">", ["field", 3, null], 10],
        aggregation: [["avg", ["field", 7, null]]],
        breakout: [["field", 3, null]],
        "order-by": [["asc", ["field", 2, null]]],
        limit: 120,
      });
      setup({ query });
      expect(screen.getByTestId("read-only-notebook")).toBeInTheDocument();

      expect(await screen.findByText("Products")).toBeInTheDocument();

      expect(screen.getByText("Filter")).toBeInTheDocument();
      expect(screen.getByText("ID is greater than 10")).toBeInTheDocument();

      expect(screen.getByText("Average of Price")).toBeInTheDocument();
      expect(screen.getByText("by")).toBeInTheDocument();
      expect(screen.getByText("ID")).toBeInTheDocument();

      expect(screen.getByText("Sort")).toBeInTheDocument();
      // sort ascending shows an up arrow
      expect(getIcon("arrow_up")).toBeInTheDocument();
      expect(screen.getByText("Rating")).toBeInTheDocument();

      expect(screen.getByText("Row limit")).toBeInTheDocument();

      const limitInput = screen.getByPlaceholderText("Enter a limit");
      expect(limitInput).toHaveValue(120);
    });

    it("does not show the visualize button", async () => {
      const query = makeQuery({ "source-table": 1 });
      setup({ query });
      expect(screen.getByTestId("read-only-notebook")).toBeInTheDocument();
      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(screen.queryByText("Visualize")).not.toBeInTheDocument();
    });
  });

  describe("native queries", () => {
    it("shows the native query editor", async () => {
      const query = createMockNativeDatasetQuery({
        native: {
          query: "SELECT * FROM products WHERE id > 10;",
        },
      });

      setup({ query });

      expect(
        await screen.findByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
    });
  });
});
