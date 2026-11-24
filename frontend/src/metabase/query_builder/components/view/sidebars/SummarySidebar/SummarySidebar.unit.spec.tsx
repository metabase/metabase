import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { fireEvent, screen, within } from "__support__/ui";
import { format } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { Card, TestBreakoutSpec, TestStageSpec } from "metabase-types/api";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersCreatedAtDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  STAGE_INDEX,
  SUMMARIZED_QUERY,
  createQueryWithMetric,
  drop,
  endDrag,
  getChipLabels,
  getFieldButton,
  getFieldDrag,
  setup,
  startDrag,
} from "./tests/setup";
import { getDimensionItems, getValueItems } from "./utils";

const CREATED_AT_BY_MONTH: TestBreakoutSpec = {
  type: "column",
  name: "CREATED_AT",
  unit: "month",
};

const ALL_DATE_UNITS = [
  "Minute",
  "Hour",
  "Day",
  "Week",
  "Month",
  "Quarter",
  "Year",
  "Minute of hour",
  "Hour of day",
  "Day of week",
  "Day of month",
  "Day of year",
  "Week of year",
  "Month of year",
  "Quarter of year",
  "Don't bin",
];

const SAVED_QUESTION = createMockCard({
  id: 2,
  name: "Orders question",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  result_metadata: [createOrdersCreatedAtDatasetColumn()],
});

const SAVED_SQL_QUESTION = createMockCard({
  id: 3,
  name: "SQL orders",
  dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: "select created_at from orders",
  }),
  result_metadata: [
    createMockColumn({
      id: undefined,
      table_id: undefined,
      name: "CREATED_AT",
      display_name: "Created At",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
      field_ref: ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
    }),
  ],
});

function createQueryByMonthOf(card: Card) {
  const provider = createMetadataProvider({
    metadata: createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  return Lib.createTestQuery(provider, {
    stages: [
      {
        source: { type: "card", id: card.id },
        aggregations: [{ type: "operator", operator: "count" }],
        breakouts: [CREATED_AT_BY_MONTH],
      },
    ],
  });
}

const NOTEBOOK_VALUES = [
  ["Average order", "Sum([Total]) / Count()"],
  ["Big orders", "CountIf([Total] > 100)"],
  ["Median of Total", "Median([Total])"],
  ["P90 total", "Percentile([Total], 0.9)"],
];
const NOTEBOOK_VALUE_NAMES = NOTEBOOK_VALUES.map(([name]) => name);
const FORMULA_VALUE_NAMES = ["Average order", "Big orders", "P90 total"];

const NOTEBOOK_VALUES_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [
        {
          name: "Average order",
          value: {
            type: "operator",
            operator: "/",
            args: [
              {
                type: "operator",
                operator: "sum",
                args: [{ type: "column", name: "TOTAL" }],
              },
              { type: "operator", operator: "count" },
            ],
          },
        },
        {
          name: "Big orders",
          value: {
            type: "operator",
            operator: "count-where",
            args: [
              {
                type: "operator",
                operator: ">",
                args: [
                  { type: "column", name: "TOTAL" },
                  { type: "literal", value: 100 },
                ],
              },
            ],
          },
        },
        {
          type: "operator",
          operator: "median",
          args: [{ type: "column", name: "TOTAL" }],
        },
        {
          name: "P90 total",
          value: {
            type: "operator",
            operator: "percentile",
            args: [
              { type: "column", name: "TOTAL" },
              { type: "literal", value: 0.9 },
            ],
          },
        },
        {
          type: "operator",
          operator: "sum",
          args: [{ type: "column", name: "SUBTOTAL" }],
        },
      ],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    },
  ],
});

function getValueFormulas(query: Lib.Query) {
  return Promise.all(
    Lib.aggregations(query, STAGE_INDEX).map(async (clause) => [
      Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
      await format(clause, {
        query,
        stageIndex: STAGE_INDEX,
        printWidth: Infinity,
      }),
    ]),
  );
}

async function pickValueOption(searchText: string, name: string) {
  await userEvent.type(
    screen.getByLabelText("Add a value by name"),
    searchText,
  );
  const options = await screen.findAllByRole("option");
  const option = options.find((option) => option.textContent === name);
  if (option == null) {
    throw new Error(`No ${name} option`);
  }
  await userEvent.click(option);
}

describe("SummarySidebar", () => {
  it("opens a bare query empty", () => {
    const { onQueryChange } = setup();

    expect(getChipLabels("values")).toEqual([]);
    expect(getChipLabels("columns")).toEqual([]);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("doesn't change query on sidebar open and close with empty wells", async () => {
    const { onQueryChange, unmount } = setup();
    const valuesInput = screen.getByLabelText("Add a value by name");
    const groupingsInput = screen.getByLabelText("Add a grouping by name");
    const search = screen.getByLabelText("Search fields");

    await userEvent.type(valuesInput, "tot");
    await userEvent.clear(valuesInput);
    await userEvent.type(valuesInput, "{Backspace}");
    await userEvent.type(groupingsInput, "cre");
    await userEvent.clear(groupingsInput);
    await userEvent.type(groupingsInput, "{Backspace}");
    await userEvent.type(search, "total");
    await userEvent.clear(search);
    await userEvent.click(screen.getByLabelText("Hide fields"));
    await userEvent.click(screen.getByLabelText("Show fields"));
    unmount(); // simulate sidebar close

    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("counts the rows once a grouping is added to a summary without values", async () => {
    const { onQueryChange, getLastQuery } = setup();

    await userEvent.click(getFieldButton("Product", "Category"));

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery()).toEqual({
      values: ["Count"],
      dimensions: ["Product → Category"],
    });
    expect(getChipLabels("values")).toEqual(["Count"]);
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
  });

  it("keeps the values a summary already has when a grouping is added", async () => {
    const { getLastQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              {
                type: "operator",
                operator: "sum",
                args: [{ type: "column", name: "TOTAL" }],
              },
            ],
          },
        ],
      }),
    });

    await userEvent.click(getFieldButton("Product", "Category"));
    expect(getLastQuery()).toEqual({
      values: ["Sum of Total"],
      dimensions: ["Product → Category"],
    });

    fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });
    expect(getLastQuery().values).toEqual(["Sum of Total"]);
  });

  it("runs once Count of rows is picked", async () => {
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

  it("doesn't rerun when a value that's already there is picked again", async () => {
    const { onQueryChange } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
          },
        ],
      }),
    });

    await userEvent.type(screen.getByLabelText("Add a value by name"), "count");
    const options = await screen.findAllByRole("option");
    const countOption = options.find(
      (option) => option.textContent === "Count of rows",
    );
    if (countOption == null) {
      throw new Error("No Count of rows option");
    }
    await userEvent.click(countOption);

    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("doesn't count the rows again when a named count is already there", async () => {
    const { onQueryChange } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              {
                name: "Orders",
                value: { type: "operator", operator: "count" },
              },
            ],
          },
        ],
      }),
    });

    await userEvent.type(screen.getByLabelText("Add a value by name"), "count");
    const options = await screen.findAllByRole("option");
    const countOption = options.find(
      (option) => option.textContent === "Count of rows",
    );
    expect(countOption).toBeDefined();
    if (countOption) {
      await userEvent.click(countOption);
    }

    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("aggregates a column picked in the Summarize by typeahead with its default operator", async () => {
    const { getLastQuery } = setup();

    await pickValueOption("quant", "Quantity");

    expect(getLastQuery()).toEqual({
      values: ["Sum of Quantity"],
      dimensions: [],
    });
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

    await userEvent.click(getFieldButton("Orders", "Created At"));
    expect(getLastQuery().dimensions).toEqual(["Created At: Month"]);
  });

  it("adds a column that's already grouped again, with its next unit, on alt-click", () => {
    const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });

    fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });

    expect(getLastQuery().dimensions).toEqual([
      "Created At: Month",
      "Created At: Quarter",
    ]);
  });

  it("doesn't rerun when the clicked field is all its well holds", async () => {
    const { onQueryChange } = setup({ query: createQueryWithMetric() });

    await userEvent.click(getFieldButton("Metrics", "Revenue"));
    await userEvent.click(getFieldButton("Metrics", "Revenue"));
    await userEvent.click(getFieldButton("Product", "Category"));
    await userEvent.click(getFieldButton("Product", "Category"));

    expect(onQueryChange).toHaveBeenCalledTimes(2);
  });

  it("replaces the values on a metric click", async () => {
    const { getLastQuery } = setup({ query: createQueryWithMetric() });

    await userEvent.click(getFieldButton("Metrics", "Revenue"));

    expect(getLastQuery()).toEqual({ values: ["Revenue"], dimensions: [] });
    expect(getChipLabels("values")).toEqual(["Revenue"]);
  });

  it("keeps Clear all disabled while the summary is empty", () => {
    setup();

    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it.each<[string, TestStageSpec]>([
    ["values", { aggregations: [{ type: "operator", operator: "count" }] }],
    [
      "groupings",
      { breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }] },
    ],
  ])(
    "clears a summary that has only %s, in one change",
    async (_well, stage) => {
      const { onQueryChange, getLastQuery } = setup({
        query: Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID }, ...stage }],
        }),
      });
      const clearAll = screen.getByRole("button", { name: "Clear all" });
      expect(clearAll).toBeEnabled();

      await userEvent.click(clearAll);

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(getLastQuery()).toEqual({ values: [], dimensions: [] });
      expect(getChipLabels("values")).toEqual([]);
      expect(getChipLabels("columns")).toEqual([]);
      expect(clearAll).toBeDisabled();
    },
  );

  it("groups by a field found through the search, and adds another on alt-click", async () => {
    const { getLastQuery } = setup();
    const search = screen.getByLabelText("Search fields");

    await userEvent.type(search, "categ");
    await userEvent.click(getFieldButton("Product", "Category"));
    expect(getLastQuery()).toEqual({
      values: ["Count"],
      dimensions: ["Product → Category"],
    });

    await userEvent.clear(search);
    await userEvent.type(search, "vend");
    fireEvent.click(getFieldButton("Product", "Vendor"), { altKey: true });
    expect(getLastQuery()).toEqual({
      values: ["Count"],
      dimensions: ["Product → Category", "Product → Vendor"],
    });
  });

  it("replaces the values with a metric found through the search", async () => {
    const { getLastQuery } = setup({ query: createQueryWithMetric() });

    await userEvent.type(screen.getByLabelText("Search fields"), "reven");
    await userEvent.click(getFieldButton("Metrics", "Revenue"));

    expect(getLastQuery()).toEqual({ values: ["Revenue"], dimensions: [] });
  });

  it("relabels a grouping chip and marks its new unit once the unit changes", async () => {
    const { onQueryChange, getLastQuery } = setup({ query: SUMMARIZED_QUERY });

    await userEvent.click(
      screen.getByRole("button", {
        name: "Change how Created At: Month is grouped",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Year" }),
    );

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery().dimensions).toEqual(["Created At: Year"]);
    expect(getChipLabels("columns")).toEqual(["Created At: Year"]);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Change how Created At: Year is grouped",
      }),
    );

    expect(
      within(
        await screen.findByRole("menuitem", { name: "Year" }),
      ).getByLabelText("check icon"),
    ).toBeInTheDocument();
  });

  it("keeps the sort of a grouping, with its direction, when its unit changes (metabase#16770)", async () => {
    const { onQueryChange, getLastQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [CREATED_AT_BY_MONTH],
            orderBys: [{ ...CREATED_AT_BY_MONTH, direction: "desc" }],
          },
        ],
      }),
    });

    await userEvent.click(
      screen.getByRole("button", {
        name: "Change how Created At: Month is grouped",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Year" }),
    );

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery().dimensions).toEqual(["Created At: Year"]);
    const [[nextQuery]] = onQueryChange.mock.calls;
    expect(
      Lib.orderBys(nextQuery, STAGE_INDEX).map((orderBy) => {
        const { displayName, direction } = Lib.displayInfo(
          nextQuery,
          STAGE_INDEX,
          orderBy,
        );
        return [displayName, direction];
      }),
    ).toEqual([["Created At: Year", "desc"]]);
  });

  it.each<[string, Card]>([
    ["a saved question", SAVED_QUESTION],
    ["a saved SQL question", SAVED_SQL_QUESTION],
  ])(
    "offers every date unit for a column of %s (metabase#10441, metabase#11439)",
    async (_source, card) => {
      const { getLastQuery } = setup({ query: createQueryByMonthOf(card) });

      await userEvent.click(
        screen.getByRole("button", {
          name: "Change how Created At: Month is grouped",
        }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "More…" }),
      );

      expect(
        screen.getAllByRole("menuitem").map((item) => item.textContent),
      ).toEqual(ALL_DATE_UNITS);

      await userEvent.click(
        screen.getByRole("menuitem", { name: "Hour of day" }),
      );

      expect(getLastQuery()).toEqual({
        values: ["Count"],
        dimensions: ["Created At: Hour of day"],
      });
    },
  );

  it.each<{
    place: string;
    breakouts: TestBreakoutSpec[];
    dimensions: string[];
  }>([
    { place: "alone", breakouts: [], dimensions: [] },
    {
      place: "next to a grouping",
      breakouts: [CREATED_AT_BY_MONTH],
      dimensions: ["Created At: Month"],
    },
  ])(
    "removes the last value when it is $place, and doesn't count the rows again (metabase#48033)",
    async ({ breakouts, dimensions }) => {
      const { onQueryChange, getLastQuery } = setup({
        query: Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts,
            },
          ],
        }),
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Count" }),
      );

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(getLastQuery()).toEqual({ values: [], dimensions });
      expect(getChipLabels("values")).toEqual([]);
      expect(getChipLabels("columns")).toEqual(dimensions);
    },
  );

  describe("values made in the notebook", () => {
    it("shows custom expressions, a median and a percentile as chips, with a function menu for the median only", async () => {
      setup({ query: NOTEBOOK_VALUES_QUERY });

      expect(getChipLabels("values")).toEqual([
        ...NOTEBOOK_VALUE_NAMES,
        "Sum of Subtotal",
      ]);
      FORMULA_VALUE_NAMES.forEach((name) => {
        expect(
          screen.queryByRole("button", {
            name: `Change how ${name} is calculated`,
          }),
        ).not.toBeInTheDocument();
      });

      await userEvent.click(
        screen.getByRole("button", {
          name: "Change how Median of Total is calculated",
        }),
      );
      expect(
        within(
          await screen.findByRole("menuitem", { name: "Median of ..." }),
        ).getByLabelText("check icon"),
      ).toBeInTheDocument();
    });

    it.each([
      {
        name: "another value is added",
        edit: () => pickValueOption("quant", "Quantity"),
        values: [...NOTEBOOK_VALUE_NAMES, "Sum of Subtotal", "Sum of Quantity"],
        dimensions: ["Created At: Month"],
      },
      {
        name: "another value changes its function",
        edit: async () => {
          await userEvent.click(
            screen.getByRole("button", {
              name: "Change how Sum of Subtotal is calculated",
            }),
          );
          await userEvent.click(
            await screen.findByRole("menuitem", { name: "Average of ..." }),
          );
        },
        values: [...NOTEBOOK_VALUE_NAMES, "Average of Subtotal"],
        dimensions: ["Created At: Month"],
      },
      {
        name: "another value is removed",
        edit: () =>
          userEvent.click(
            screen.getByRole("button", { name: "Remove Sum of Subtotal" }),
          ),
        values: NOTEBOOK_VALUE_NAMES,
        dimensions: ["Created At: Month"],
      },
      {
        name: "a grouping changes its date unit",
        edit: async () => {
          await userEvent.click(
            screen.getByRole("button", {
              name: "Change how Created At: Month is grouped",
            }),
          );
          await userEvent.click(
            await screen.findByRole("menuitem", { name: "Year" }),
          );
        },
        values: [...NOTEBOOK_VALUE_NAMES, "Sum of Subtotal"],
        dimensions: ["Created At: Year"],
      },
      {
        name: "a grouping is added",
        edit: async () => {
          const user = userEvent.setup();
          await user.keyboard("{Alt>}");
          await user.click(getFieldButton("Product", "Category"));
        },
        values: [...NOTEBOOK_VALUE_NAMES, "Sum of Subtotal"],
        dimensions: ["Created At: Month", "Product → Category"],
      },
      {
        name: "the groupings are replaced",
        edit: () => userEvent.click(getFieldButton("Product", "Category")),
        values: [...NOTEBOOK_VALUE_NAMES, "Sum of Subtotal"],
        dimensions: ["Product → Category"],
      },
      {
        name: "a grouping is removed",
        edit: () =>
          userEvent.click(
            screen.getByRole("button", { name: "Remove Created At: Month" }),
          ),
        values: [...NOTEBOOK_VALUE_NAMES, "Sum of Subtotal"],
        dimensions: [],
      },
    ])("keeps them when $name", async ({ edit, values, dimensions }) => {
      const { onQueryChange, getLastQuery } = setup({
        query: NOTEBOOK_VALUES_QUERY,
      });

      await edit();

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(getLastQuery()).toEqual({ values, dimensions });
      const [[nextQuery]] = onQueryChange.mock.calls;
      const formulas = await getValueFormulas(nextQuery);
      expect(formulas.slice(0, NOTEBOOK_VALUES.length)).toEqual(
        NOTEBOOK_VALUES,
      );
      expect(getChipLabels("values")).toEqual(values);
    });
  });

  describe("drag and drop", () => {
    it("adds a dragged field to the well it's dropped on", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const { onQueryChange, getLastQuery } = setup({ query });

      drop(getFieldDrag(query, "Orders", "Quantity"), "values");
      expect(getLastQuery()).toEqual({
        values: ["Sum of Quantity"],
        dimensions: [],
      });

      drop(getFieldDrag(query, "Product", "Category"), "columns");
      expect(getLastQuery()).toEqual({
        values: ["Sum of Quantity"],
        dimensions: ["Product → Category"],
      });
      expect(onQueryChange).toHaveBeenCalledTimes(2);
      expect(getChipLabels("columns")).toEqual(["Product → Category"]);
    });

    it("adds a dragged column that's already grouped again, with its next unit", () => {
      const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });

      drop(getFieldDrag(SUMMARIZED_QUERY, "Orders", "Created At"), "columns");

      expect(getLastQuery().dimensions).toEqual([
        "Created At: Month",
        "Created At: Quarter",
      ]);
    });

    it("shows a preview and which wells take the dragged item until the drag ends", () => {
      const query = createQueryWithMetric();
      setup({ query });
      const valuesWell = screen.getByTestId("summary-well-values");
      const columnsWell = screen.getByTestId("summary-well-columns");

      startDrag(getFieldDrag(query, "Metrics", "Revenue"));
      expect(valuesWell).toHaveAttribute("data-drop", "accepts");
      expect(columnsWell).toHaveAttribute("data-drop", "rejects");
      expect(screen.getByTestId("summary-drag-preview")).toHaveTextContent(
        "Revenue",
      );

      endDrag(null);
      expect(valuesWell).not.toHaveAttribute("data-drop");
      expect(columnsWell).not.toHaveAttribute("data-drop");
      expect(
        screen.queryByTestId("summary-drag-preview"),
      ).not.toBeInTheDocument();
    });

    it("moves a grouping chip to Summarize by", () => {
      const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });
      const [item] = getDimensionItems(SUMMARIZED_QUERY, STAGE_INDEX);

      drop({ kind: "dimension", item, wellId: "columns" }, "values");

      expect(getLastQuery()).toEqual({
        values: ["Count", "Sum of Total", "Distinct values of Created At"],
        dimensions: [],
      });
    });

    it("moves a column value chip to Group by", () => {
      const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });
      const [, item] = getValueItems(SUMMARIZED_QUERY, STAGE_INDEX);

      drop({ kind: "value", item }, "columns");

      expect(getLastQuery()).toEqual({
        values: ["Count"],
        dimensions: ["Created At: Month", "Total: Auto binned"],
      });
    });

    it("leaves the query alone when the drop is rejected or misses", () => {
      const { onQueryChange } = setup({ query: SUMMARIZED_QUERY });
      const [countItem] = getValueItems(SUMMARIZED_QUERY, STAGE_INDEX);

      drop({ kind: "value", item: countItem }, "columns");
      drop({ kind: "value", item: countItem }, "values");
      drop(getFieldDrag(SUMMARIZED_QUERY, "Orders", "Quantity"), null);

      expect(onQueryChange).not.toHaveBeenCalled();
    });

    it("leaves an empty summary alone when a metric is dropped on Group by", () => {
      const query = createQueryWithMetric();
      const { onQueryChange } = setup({ query });

      drop(getFieldDrag(query, "Metrics", "Revenue"), "columns");

      expect(onQueryChange).not.toHaveBeenCalled();
      expect(getChipLabels("values")).toEqual([]);
    });

    it("doesn't count the rows when a grouping chip is dropped back on Group by", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      });
      const { onQueryChange } = setup({ query });
      const [item] = getDimensionItems(query, STAGE_INDEX);

      drop({ kind: "dimension", item, wellId: "columns" }, "columns");

      expect(onQueryChange).not.toHaveBeenCalled();
    });
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

  it("keeps the search and the collapsed sections while the field list is hidden", async () => {
    setup();
    const getUserToggle = () =>
      within(screen.getByRole("region", { name: "User" })).getByRole("button", {
        name: "User",
      });
    const hideAndShowFields = async () => {
      await userEvent.click(screen.getByLabelText("Hide fields"));
      await userEvent.click(screen.getByLabelText("Show fields"));
    };

    await userEvent.click(getUserToggle());
    expect(getUserToggle()).toHaveAttribute("aria-expanded", "false");
    await hideAndShowFields();
    expect(getUserToggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.type(screen.getByLabelText("Search fields"), "tota");
    await hideAndShowFields();
    expect(screen.getByLabelText("Search fields")).toHaveValue("tota");
    expect(
      within(screen.getByRole("region", { name: "Orders" }))
        .getAllByTestId("summary-field-item")
        .map((item) => item.textContent),
    ).toEqual(["Subtotal", "Total"]);
  });
});
