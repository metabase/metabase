import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  createQueryWithClauses,
  findAggregationOperator,
} from "metabase-lib/test-helpers";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import type { State } from "metabase-types/store";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { AggregationPicker } from "./AggregationPicker";

function createQueryWithCountAggregation({
  metadata,
}: { metadata?: Metadata } = {}) {
  return createQueryWithClauses({
    query: createQuery({ metadata }),
    aggregations: [{ operatorName: "count" }],
  });
}

function createQueryWithCountAndSumAggregations({
  metadata,
}: { metadata?: Metadata } = {}) {
  return createQueryWithClauses({
    query: createQuery({ metadata }),
    aggregations: [
      { operatorName: "count" },
      { operatorName: "sum", columnName: "PRICE", tableName: "PRODUCTS" },
    ],
  });
}

function createQueryWithMaxAggregation({
  metadata,
}: { metadata?: Metadata } = {}) {
  const initialQuery = createQuery({ metadata });
  const max = findAggregationOperator(initialQuery, "max");
  const findColumn = columnFinder(
    initialQuery,
    Lib.aggregationOperatorColumns(max),
  );
  const quantity = findColumn("ORDERS", "QUANTITY");
  const clause = Lib.aggregationClause(max, quantity);
  return Lib.aggregate(initialQuery, 0, clause);
}

function createQueryWithInlineExpression() {
  return createQuery({
    query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        aggregation: [
          [
            "aggregation-options",
            ["avg", ["field", ORDERS.QUANTITY, null]],
            { name: "Avg Q", "display-name": "Avg Q" },
          ],
        ],
      },
    },
  });
}

function createQueryWithInlineExpressionWithOperator() {
  return createQuery({
    query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        aggregation: [
          [
            "aggregation-options",
            ["count"],
            { name: "My count", "display-name": "My count" },
          ],
        ],
      },
    },
  });
}

function createQueryWithDateExpressionAndAggregation() {
  return createQuery({
    query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        expressions: {
          "Created At plus one month": [
            "datetime-add",
            [
              "field",
              PRODUCTS.CREATED_AT,
              {
                "base-type": "type/DateTime",
              },
            ],
            1,
            "month",
          ],
        },
        aggregation: [["count"]],
        breakout: [
          [
            "expression",
            "Created At plus one month",
            {
              "base-type": "type/DateTime",
            },
          ],
        ],
      },
    },
  });
}

function createMetadata({
  hasExpressionSupport = true,
}: { hasExpressionSupport?: boolean } = {}) {
  return createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable(),
          createPeopleTable(),
          createProductsTable(),
          createReviewsTable(),
        ],
        features: hasExpressionSupport
          ? COMMON_DATABASE_FEATURES
          : _.without(COMMON_DATABASE_FEATURES, "expression-aggregations"),
      }),
    ],
  });
}

type SetupOpts = {
  state?: State;
  metadata?: Metadata;
  query?: Lib.Query;
  hasExpressionInput?: boolean;
};

function setup({
  state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
    qb: createMockQueryBuilderState({
      card: createMockCard(),
    }),
  }),
  metadata = createMetadata(),
  query = createQuery({ metadata }),
  hasExpressionInput = true,
}: SetupOpts = {}) {
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
      hasExpressionInput={hasExpressionInput}
      onQueryChange={onQueryChange}
    />,
    { storeInitialState: state },
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

      expect(screen.getByText("Basic Metrics")).toBeInTheDocument();

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
      ].forEach(name => {
        expect(screen.getByRole("option", { name })).toBeInTheDocument();
      });
    });

    it("should have a working global search", async () => {
      setup();

      expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();

      await userEvent.type(screen.getByPlaceholderText("Find..."), "Count");

      ["Count of rows", "Cumulative count of rows"].forEach(name => {
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
      ].forEach(name => {
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

    it("should highlight selected operator", () => {
      setup({ query: createQueryWithCountAggregation() });

      expect(
        screen.getByRole("option", { name: "Count of rows" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("option", { name: "Sum of ..." }),
      ).not.toHaveAttribute("aria-selected");
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
      const { getRecentClauseInfo } = setup();

      const expression = "count + 1";
      const expressionName = "My expression";

      await userEvent.click(screen.getByText("Custom Expression"));
      await userEvent.type(screen.getByLabelText("Expression"), expression);
      await userEvent.type(screen.getByLabelText("Name"), expressionName);
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(getRecentClauseInfo()?.displayName).toBe(expressionName);
    });

    it("should open the editor when a named expression without operator is used", async () => {
      setup({ query: createQueryWithInlineExpression() });

      expect(screen.getByText("Custom Expression")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Avg Q")).toBeInTheDocument();
    });

    it("should open the editor when a named expression with operator is used", async () => {
      setup({ query: createQueryWithInlineExpressionWithOperator() });

      expect(screen.getByText("Custom Expression")).toBeInTheDocument();
      expect(screen.getByDisplayValue("My count")).toBeInTheDocument();
    });

    it("shouldn't be available if database doesn't support custom expressions", () => {
      setup({
        state: createMockState({
          entities: createMockEntitiesState({
            databases: [
              {
                ...createSampleDatabase(),
                features: _.without(
                  COMMON_DATABASE_FEATURES,
                  "expression-aggregations",
                ),
              },
            ],
          }),
          qb: createMockQueryBuilderState({
            card: createMockCard(),
          }),
        }),
        metadata: createMetadata({ hasExpressionSupport: false }),
      });
      expect(screen.queryByText("Custom Expression")).not.toBeInTheDocument();
    });

    it("shouldn't be shown if `hasExpressionInput` prop is false", () => {
      setup({ hasExpressionInput: false });
      expect(screen.queryByText("Custom Expression")).not.toBeInTheDocument();
    });

    it("should open the editor even if `hasExpressionInput` prop is false if expression is used", () => {
      setup({
        query: createQueryWithInlineExpression(),
        hasExpressionInput: false,
      });

      expect(screen.getByText("Custom Expression")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Avg Q")).toBeInTheDocument();
    });
  });

  describe("column compare shortcut", () => {
    it("does not display the shortcut if there are no aggregations", () => {
      setup();
      expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    });

    it("does not display the shortcut if there are no possible breakouts to use", () => {
      setup({
        query: createQueryWithDateExpressionAndAggregation(),
      });
      expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    });

    it("displays the shortcut with correct label if there is 1 aggregation", () => {
      setup({ query: createQueryWithCountAggregation() });
      expect(screen.getByText("Compare to the past")).toBeInTheDocument();
    });

    it("displays the shortcut with correct label if there are multiple aggregation", () => {
      setup({ query: createQueryWithCountAndSumAggregations() });
      expect(screen.getByText("Compare to the past")).toBeInTheDocument();
    });

    it("calls 'onQueryChange' on submit", async () => {
      const { onQueryChange } = setup({
        query: createQueryWithCountAggregation(),
      });

      await userEvent.click(screen.getByText("Compare to the past"));
      await userEvent.click(screen.getByText("Done"));

      expect(onQueryChange).toHaveBeenCalled();
    });
  });
});
