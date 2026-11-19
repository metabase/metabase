import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { State } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Database } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { AggregationPicker } from "./AggregationPicker";

function createQueryWithCountAggregation() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  });
}

function createQueryWithMaxAggregation() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },

        aggregations: [
          {
            type: "operator",
            operator: "max",
            args: [{ type: "column", name: "QUANTITY" }],
          },
        ],
      },
    ],
  });
}

function createQueryWithInlineExpression() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        aggregations: [
          {
            name: "Avg Q",
            value: {
              type: "operator",
              operator: "avg",
              args: [{ type: "column", name: "QUANTITY" }],
            },
          },
        ],
      },
    ],
  });
}

function createQueryWithInlineExpressionWithOperator() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          {
            name: "My count",
            value: {
              type: "operator",
              operator: "count",
            },
          },
        ],
      },
    ],
  });
}

const ORDERS_METRIC = createMockCard({
  id: 101,
  name: "Orders metric",
  type: "metric",
  table_id: ORDERS_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
});

const ORDERS_FILTER_METRIC = createMockCard({
  id: 102,
  name: "Orders metric with filter",
  type: "metric",
  description: "This is a description _with markdown_",
  table_id: ORDERS_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: [
          {
            type: "operator",
            operator: ">",
            args: [
              { type: "column", fieldId: ORDERS.TOTAL },
              { type: "literal", value: 100 },
            ],
          },
        ],
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
});

const PRODUCTS_METRIC = createMockCard({
  id: 103,
  name: "Products metric",
  type: "metric",
  table_id: PRODUCTS_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
});

const ORDERS_MODEL = createMockCard({
  id: 104,
  name: "Orders model",
  type: "model",
  table_id: ORDERS_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  }),
});

// The API saves the model's table as `table_id` of a model-based metric, and
// sets `source_card_id`, which the `Card` type does not declare.
const ORDERS_MODEL_METRIC = {
  ...createMockCard({
    id: 105,
    name: "Orders model metric",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: Lib.createTestJsQuery(
      createMetadataProvider({
        metadata: createMockMetadata({
          databases: [createSampleDatabase()],
          questions: [ORDERS_MODEL],
        }),
      }),
      {
        stages: [
          {
            source: { type: "card", id: ORDERS_MODEL.id },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
          },
        ],
      },
    ),
  }),
  source_card_id: ORDERS_MODEL.id,
};

function createQueryWithMetrics() {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: [
      PRODUCTS_METRIC,
      ORDERS_FILTER_METRIC,
      ORDERS_MODEL,
      ORDERS_MODEL_METRIC,
      ORDERS_METRIC,
    ],
  });
  return Lib.createTestQuery(
    createMetadataProvider({ metadata }),
    DEFAULT_TEST_QUERY,
  );
}

function createMetadata({
  allowCustomExpressions,
}: { allowCustomExpressions?: boolean } = {}) {
  return createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable(),
          createPeopleTable(),
          createProductsTable(),
          createReviewsTable(),
        ],
        features: allowCustomExpressions
          ? COMMON_DATABASE_FEATURES
          : _.without(COMMON_DATABASE_FEATURES, "expression-aggregations"),
      }),
    ],
  });
}

type SetupOpts = {
  database?: Database;
  state?: State;
  metadata?: Metadata;
  query?: Lib.Query;
  allowCustomExpressions?: boolean;
};

function setup({
  database = createSampleDatabase(),
  state,
  metadata = createMetadata(),
  query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  allowCustomExpressions,
}: SetupOpts = {}) {
  setupDatabaseEndpoints(database);

  const storeState =
    state ??
    createMockState({
      entities: createMockEntitiesState({ databases: [database] }),
      qb: createMockQueryBuilderState({ card: createMockCard() }),
    });

  const stageIndex = 0;
  const clause = Lib.aggregations(query, stageIndex)[0];

  const baseOperators = Lib.availableAggregationOperators(query, stageIndex);
  const operators = clause
    ? Lib.selectedAggregationOperators(baseOperators, clause)
    : baseOperators;

  const onQueryChange = jest.fn();

  renderWithProviders(
    <AggregationPicker
      query={query}
      clause={clause}
      stageIndex={stageIndex}
      operators={operators}
      allowCustomExpressions={allowCustomExpressions}
      onQueryChange={onQueryChange}
    />,
    { storeInitialState: storeState },
  );

  function getRecentClause(index: number = -1): Lib.Clause | undefined {
    expect(onQueryChange).toHaveBeenCalledWith(expect.anything());
    const [query] = onQueryChange.mock.lastCall;
    return Lib.aggregations(query, stageIndex).at(index);
  }

  function getRecentClauseInfo(index: number = -1) {
    const clause = getRecentClause(index);
    if (clause) {
      return Lib.displayInfo(query, stageIndex, clause);
    }
    return null;
  }

  return {
    metadata,
    query,
    stageIndex,
    getRecentClauseInfo,
    onQueryChange,
  };
}

describe("AggregationPicker", () => {
  describe("basic operators", () => {
    it("should list basic operators", () => {
      setup();

      expect(screen.getByText("Basic functions")).toBeInTheDocument();

      [
        "Count of rows",
        "Sum of ...",
        "Average of ...",
        "Number of distinct values of ...",
        "Cumulative sum of ...",
        "Cumulative count of rows",
        "Standard deviation of ...",
        "Minimum of ...",
        "Maximum of ...",
      ].forEach((name) => {
        expect(screen.getByRole("option", { name })).toBeInTheDocument();
      });
    });

    it("should have a working global search", async () => {
      setup();

      expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();

      await userEvent.type(screen.getByPlaceholderText("Find..."), "Count");

      ["Count of rows", "Cumulative count of rows"].forEach((name) => {
        expect(screen.getByRole("option", { name })).toBeInTheDocument();
      });

      [
        "Sum of ...",
        "Average of ...",
        "Number of distinct values of ...",
        "Cumulative sum of ...",
        "Standard deviation of ...",
        "Minimum of ...",
        "Maximum of ...",
      ].forEach((name) => {
        expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
      });
    });

    it("should apply a column-less operator", async () => {
      const { getRecentClauseInfo } = setup();

      await userEvent.click(screen.getByText("Count of rows"));

      expect(getRecentClauseInfo()).toMatchObject({
        name: "count",
        displayName: "Count",
      });
    });

    it("should apply an operator requiring columns", async () => {
      const { getRecentClauseInfo } = setup();

      await userEvent.click(screen.getByText("Average of ..."));
      await userEvent.click(screen.getByText("Quantity"));

      expect(getRecentClauseInfo()).toMatchObject({
        name: "avg",
        displayName: "Average of Quantity",
      });
    });

    it("should allow picking a foreign column", async () => {
      const { getRecentClauseInfo } = setup();

      await userEvent.click(screen.getByText("Average of ..."));
      await userEvent.click(screen.getByText("Product"));
      await userEvent.click(screen.getByText("Rating"));

      expect(getRecentClauseInfo()).toMatchObject({
        name: "avg",
        displayName: "Average of Rating",
      });
    });

    it("should only list numeric custom columns for Sum (metabase#18069)", async () => {
      const column = (name: string) => ({ type: "column", name }) as const;
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            expressions: [
              { name: "CC_Category", value: column("CATEGORY") },
              {
                name: "CC_LowerVendor",
                value: {
                  type: "operator",
                  operator: "lower",
                  args: [column("VENDOR")],
                },
              },
              {
                name: "CC_UpperTitle",
                value: {
                  type: "operator",
                  operator: "upper",
                  args: [column("TITLE")],
                },
              },
              {
                name: "CC_HalfPrice",
                value: {
                  type: "operator",
                  operator: "/",
                  args: [column("PRICE"), { type: "literal", value: 2 }],
                },
              },
              {
                name: "CC_ScaledRating",
                value: {
                  type: "operator",
                  operator: "*",
                  args: [{ type: "literal", value: 1.5 }, column("RATING")],
                },
              },
            ],
          },
        ],
      });
      const { getRecentClauseInfo } = setup({ query });

      await userEvent.click(screen.getByText("Sum of ..."));

      expect(screen.getByRole("option", { name: "Price" })).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Rating" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "CC_HalfPrice" }),
      ).toBeInTheDocument();
      ["CC_Category", "CC_LowerVendor", "CC_UpperTitle"].forEach((name) => {
        expect(screen.queryByText(name)).not.toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("CC_ScaledRating"));
      expect(getRecentClauseInfo()).toMatchObject({
        name: "sum",
        displayName: "Sum of CC_ScaledRating",
      });
    });

    it("should highlight selected operator", () => {
      setup({ query: createQueryWithCountAggregation() });

      expect(
        screen.getByRole("option", { name: "Count of rows" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("option", { name: "Sum of ..." }),
      ).toHaveAttribute("aria-selected", "false");
    });

    it("should highlight selected operator column", () => {
      setup({ query: createQueryWithMaxAggregation() });

      expect(screen.getByRole("option", { name: "Quantity" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("option", { name: "Discount" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("shouldn't list columns for column-less operators", async () => {
      setup();

      await userEvent.click(screen.getByText("Count of rows"));

      expect(screen.queryByText("Quantity")).not.toBeInTheDocument();
      // check that we're still in the same step
      expect(screen.getByText("Average of ...")).toBeInTheDocument();
    });

    it("should allow to change an operator for existing aggregation", async () => {
      const { getRecentClauseInfo } = setup({
        query: createQueryWithMaxAggregation(),
      });

      await userEvent.click(screen.getByText("Maximum of ...")); // go back
      await userEvent.click(screen.getByText("Average of ..."));
      await userEvent.click(screen.getByText("Quantity"));

      expect(getRecentClauseInfo()).toMatchObject({
        name: "avg",
        displayName: "Average of Quantity",
      });
    });

    it("should allow to change a column for existing aggregation", async () => {
      const { getRecentClauseInfo } = setup({
        query: createQueryWithMaxAggregation(),
      });

      await userEvent.click(screen.getByText("Discount"));

      expect(getRecentClauseInfo()).toMatchObject({
        name: "max",
        displayName: "Max of Discount",
      });
    });
  });

  describe("custom expressions", () => {
    it("should allow to enter a custom expression containing an aggregation", async () => {
      const { getRecentClauseInfo } = setup({ allowCustomExpressions: true });

      const expression = "count() + 1";
      const expressionName = "My expression";

      await userEvent.click(await screen.findByText("Custom Expression"));
      await userEvent.type(
        await screen.findByTestId("custom-expression-query-editor"),
        expression,
      );
      await userEvent.type(
        screen.getByTestId("expression-name"),
        expressionName,
      );
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(getRecentClauseInfo()?.displayName).toBe(expressionName);
    });

    it("should open the editor when a named expression without operator is used", async () => {
      setup({ query: createQueryWithInlineExpression() });

      expect(await screen.findByText("Custom Expression")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Avg Q")).toBeInTheDocument();
    });

    it("should open the editor when a named expression with operator is used", async () => {
      setup({ query: createQueryWithInlineExpressionWithOperator() });

      expect(screen.getByText("Custom Expression")).toBeInTheDocument();
      expect(screen.getByDisplayValue("My count")).toBeInTheDocument();
    });

    it("shouldn't be available if database doesn't support custom expressions", async () => {
      setup({
        database: createSampleDatabase({
          features: _.without(
            COMMON_DATABASE_FEATURES,
            "expression-aggregations",
          ),
        }),
        metadata: createMetadata({ allowCustomExpressions: false }),
      });

      await waitFor(() =>
        expect(screen.queryByText("Custom Expression")).not.toBeInTheDocument(),
      );
    });

    it("shouldn't be shown if `allowCustomExpressions` prop is false", () => {
      setup({ allowCustomExpressions: false });
      expect(screen.queryByText("Custom Expression")).not.toBeInTheDocument();
    });

    it("should open the editor even if `allowCustomExpressions` prop is false if expression is used", () => {
      setup({
        query: createQueryWithInlineExpression(),
        allowCustomExpressions: false,
      });

      expect(screen.getByText("Custom Expression")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Avg Q")).toBeInTheDocument();
    });
  });
  describe("metrics", () => {
    it("should list only the metrics based on the query's table (metabase#42470)", async () => {
      setup({ query: createQueryWithMetrics() });

      await userEvent.click(screen.getByText("Metrics"));

      expect(
        screen.getByRole("option", { name: "Orders metric" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Orders metric with filter/ }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Products metric")).not.toBeInTheDocument();
      expect(screen.queryByText("Orders model metric")).not.toBeInTheDocument();
    });

    it("should show the metric description on hover", async () => {
      setup({ query: createQueryWithMetrics() });

      await userEvent.click(screen.getByText("Metrics"));
      const option = screen.getByRole("option", {
        name: /Orders metric with filter/,
      });
      const moreInfo = within(option).getByLabelText("More info");
      await userEvent.hover(moreInfo);

      const description = await screen.findByText(/This is a description/);
      expect(description).toBeInTheDocument();
      expect(screen.getByText("with markdown").tagName).toBe("EM");

      await userEvent.unhover(moreInfo);
      await waitFor(() =>
        expect(
          screen.queryByText(/This is a description/),
        ).not.toBeInTheDocument(),
      );
    });

    it("should search metrics", async () => {
      setup({ query: createQueryWithMetrics() });

      await userEvent.type(
        screen.getByPlaceholderText("Find..."),
        "with filter",
      );

      expect(screen.getByText("Metrics")).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Orders metric with filter/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Orders metric" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Products metric")).not.toBeInTheDocument();
      expect(screen.queryByText("Count of rows")).not.toBeInTheDocument();
    });

    it("should add an aggregation based on the picked metric", async () => {
      const { onQueryChange } = setup({ query: createQueryWithMetrics() });

      await userEvent.click(screen.getByText("Metrics"));
      await userEvent.click(screen.getByText("Orders metric with filter"));

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      const [nextQuery] = onQueryChange.mock.lastCall;
      expect(Lib.toJsQuery(nextQuery)).toMatchObject({
        stages: [{ aggregation: [["metric", {}, ORDERS_FILTER_METRIC.id]] }],
      });
    });
  });
});
