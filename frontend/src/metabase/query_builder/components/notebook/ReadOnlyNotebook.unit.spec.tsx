import React from "react";

import { renderWithProviders, screen, getIcon } from "__support__/ui";
import { createEntitiesState } from "__support__/store";
import { setupDatabasesEndpoints } from "__support__/server-mocks/database";
import { setupSearchEndpoints } from "__support__/server-mocks/search";

import type { DatasetQuery } from "metabase-types/types/Card";

import { createMockState } from "metabase-types/store/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getMetadata } from "metabase/selectors/metadata";

import Question from "metabase-lib/Question";

import ReadOnlyNotebook from "./ReadOnlyNotebook";

const makeQuery = (options: any) => {
  // we have to cast this because we have 2 incompatible DatasetQuery types
  return createMockStructuredDatasetQuery({
    query: options,
  }) as DatasetQuery;
};

const setup = ({ query }: { query: DatasetQuery }) => {
  const database = createSampleDatabase();
  const state = createMockState({
    entities: createEntitiesState({
      databases: [database],
    }),
  });

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);

  const metadata = getMetadata(state);

  const card = {
    dataset_query: query,
  };

  const question = new Question(card, metadata);

  renderWithProviders(<ReadOnlyNotebook question={question} />, {
    storeInitialState: state,
  });
};

describe("Notebook > ReadOnlyNotebook", () => {
  describe("Basic notebook functionality", () => {
    it("shows filters", async () => {
      const query = makeQuery({
        "source-table": 1,
        filter: [">", ["field", 3, null], 10],
      });
      setup({ query });
      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(
        await screen.findByText("ID is greater than 10"),
      ).toBeInTheDocument();
    });

    it("shows summaries", async () => {
      const query = makeQuery({
        "source-table": 1,
        aggregation: [["avg", ["field", 7, null]]],
        breakout: [["field", 3, null]],
      });
      setup({ query });
      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(await screen.findByText("Average of Price")).toBeInTheDocument();
      expect(await screen.findByText("by")).toBeInTheDocument();
      expect(await screen.findByText("ID")).toBeInTheDocument();
    });

    it("shows order by", async () => {
      const query = makeQuery({
        "source-table": 1,
        "order-by": [["asc", ["field", 2, null]]],
      });
      setup({ query });
      expect(screen.getByTestId("read-only-notebook")).toBeInTheDocument();
      expect(await screen.findByText("Products")).toBeInTheDocument();

      expect(await screen.findByText("Sort")).toBeInTheDocument();
      expect(await screen.findByText("Rating")).toBeInTheDocument();

      // sort ascending shows an up arrow
      expect(getIcon("arrow_up")).toBeInTheDocument();
    });

    it("shows limit clauses", async () => {
      const query = makeQuery({
        "source-table": 1,
        limit: 120,
      });
      setup({ query });

      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(await screen.findByText("Row limit")).toBeInTheDocument();

      const limitInput = await screen.findByPlaceholderText("Enter a limit");
      expect(limitInput).toHaveValue(120);
    });
  });

  describe("Read only features", () => {
    it("shows the read-only notebook editor", async () => {
      const query = makeQuery({ "source-table": 1 });
      setup({ query });
      expect(screen.getByTestId("read-only-notebook")).toBeInTheDocument();
      expect(await screen.findByText("Products")).toBeInTheDocument();
    });

    it("does not show the visualize button", async () => {
      const query = makeQuery({ "source-table": 1 });
      setup({ query });
      expect(screen.getByTestId("read-only-notebook")).toBeInTheDocument();
      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(screen.queryByText("Visualize")).not.toBeInTheDocument();
    });

    it("does not show preview buttons", async () => {
      const query = makeQuery({ "source-table": 1 });
      setup({ query });
      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(screen.queryByLabelText("play icon")).not.toBeInTheDocument();
    });

    it("does not show remove buttons", async () => {
      const query = makeQuery({
        "source-table": 1,
        filter: [">", ["field", 3, null], 10],
      });
      setup({ query });
      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(
        await screen.findByText("ID is greater than 10"),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
    });

    it("does not show add buttons", async () => {
      const query = makeQuery({
        "source-table": 1,
        filter: [">", ["field", 3, null], 10],
      });
      setup({ query });
      expect(await screen.findByText("Products")).toBeInTheDocument();
      expect(
        await screen.findByText("ID is greater than 10"),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("add icon")).not.toBeInTheDocument();
    });

    it("does not show dropdowns to pick columns", async () => {
      const query = makeQuery({
        "source-table": 1,
        filter: [">", ["field", 3, null], 10],
      });
      setup({ query });
      expect(await screen.findByText("Products")).toBeInTheDocument();

      expect(
        screen.queryByLabelText("chevrondown icon"),
      ).not.toBeInTheDocument();
    });

    it("does not show sections without query clauses or section add buttons", async () => {
      const query = makeQuery({
        "source-table": 1,
      });
      setup({ query });
      expect(await screen.findByText("Products")).toBeInTheDocument();

      expect(screen.queryByText("Filter")).not.toBeInTheDocument();
      expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
      expect(screen.queryByText("Join data")).not.toBeInTheDocument();
      expect(screen.queryByText("Custom column")).not.toBeInTheDocument();
      expect(screen.queryByText("Row limit")).not.toBeInTheDocument();
    });
  });
});
