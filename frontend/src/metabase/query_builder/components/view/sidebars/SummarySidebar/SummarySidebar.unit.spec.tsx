import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { SummarySidebar } from "./SummarySidebar";
import type { SummaryWellId } from "./types";
import { getDimensionItems, getValueItems } from "./utils";

const STAGE_INDEX = -1;

type SetupOpts = {
  query?: Lib.Query;
};

function setup({
  query: initialQuery = Lib.createTestQuery(
    SAMPLE_PROVIDER,
    DEFAULT_TEST_QUERY,
  ),
}: SetupOpts = {}) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  function Wrapper() {
    const [query, setQuery] = useState(initialQuery);
    return (
      <SummarySidebar
        query={query}
        stageIndex={STAGE_INDEX}
        onQueryChange={(nextQuery) => {
          setQuery(nextQuery);
          onQueryChange(nextQuery);
        }}
      />
    );
  }

  renderWithProviders(<Wrapper />);

  function getLastQuery() {
    const [lastCall] = onQueryChange.mock.calls.slice(-1);
    const [nextQuery] = lastCall;
    return {
      values: getValueItems(nextQuery, STAGE_INDEX).map(({ label }) => label),
      dimensions: getDimensionItems(nextQuery, STAGE_INDEX).map(
        ({ label }) => label,
      ),
    };
  }

  return { onQueryChange, getLastQuery };
}

function createQueryWithMetric() {
  const metric = createMockCard({
    id: 1,
    name: "Revenue",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
    }),
  });
  const provider = createMetadataProvider({
    metadata: createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [metric],
    }),
  });
  return Lib.createTestQuery(provider, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
}

function getChipLabels(wellId: SummaryWellId) {
  return within(screen.getByTestId(`summary-well-${wellId}`))
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

function getFieldButton(sectionName: string, name: string) {
  return within(screen.getByRole("region", { name: sectionName })).getByRole(
    "button",
    { name },
  );
}

describe("SummarySidebar", () => {
  it("starts a bare query from Count of rows without running it", () => {
    const { onQueryChange } = setup();

    expect(getChipLabels("values")).toEqual(["Count"]);
    expect(getChipLabels("columns")).toEqual([]);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("runs once a grouping joins the starting count", async () => {
    const { onQueryChange, getLastQuery } = setup();

    await userEvent.click(getFieldButton("Product", "Category"));

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery()).toEqual({
      values: ["Count"],
      dimensions: ["Product → Category"],
    });
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
  });

  it("runs the starting count once Count of rows is picked", async () => {
    const { onQueryChange, getLastQuery } = setup();

    await userEvent.type(screen.getByLabelText("Add a value by name"), "count");
    const options = await screen.findAllByRole("option");
    const countOption = options.find(
      (option) => option.textContent === "Count of rows",
    );
    if (countOption == null) {
      throw new Error("No Count of rows option");
    }
    await userEvent.click(countOption);

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery()).toEqual({ values: ["Count"], dimensions: [] });
  });

  it("drops the starting count without running when it's removed first", async () => {
    const { onQueryChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Remove Count" }));

    expect(getChipLabels("values")).toEqual([]);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("replaces the groupings on a field click and adds on alt-click", async () => {
    const { getLastQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      }),
    });

    await userEvent.click(getFieldButton("Product", "Category"));
    expect(getLastQuery().dimensions).toEqual(["Product → Category"]);

    fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });
    expect(getLastQuery().dimensions).toEqual([
      "Product → Category",
      "Created At: Month",
    ]);
  });

  it("replaces the values on a metric click", async () => {
    const { getLastQuery } = setup({ query: createQueryWithMetric() });

    await userEvent.click(getFieldButton("Metrics", "Revenue"));

    expect(getLastQuery()).toEqual({ values: ["Revenue"], dimensions: [] });
    expect(getChipLabels("values")).toEqual(["Revenue"]);
  });

  it("clears every well at once", async () => {
    const { getLastQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(getLastQuery()).toEqual({ values: [], dimensions: [] });
    expect(getChipLabels("values")).toEqual([]);
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it("hides and shows the field list from the footer button", async () => {
    setup();
    const drawer = screen.getByTestId("summary-field-list-drawer");

    await userEvent.click(screen.getByLabelText("Hide fields"));
    expect(drawer).not.toHaveAttribute("data-open");
    expect(screen.getByLabelText("Show fields")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByLabelText("Show fields")).toHaveAttribute(
      "aria-controls",
      drawer.id,
    );

    await userEvent.click(screen.getByLabelText("Show fields"));
    expect(drawer).toHaveAttribute("data-open");
    expect(screen.getByLabelText("Hide fields")).toBeInTheDocument();
  });
});
