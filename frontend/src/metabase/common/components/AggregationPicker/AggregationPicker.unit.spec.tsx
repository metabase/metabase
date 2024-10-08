import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  SAMPLE_DB_ID,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createPeopleTable,
  createProductsCategoryField,
  createProductsIdField,
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

function createQueryWithCountAggregation() {
  return createQueryWithClauses({
    aggregations: [{ operatorName: "count" }],
  });
}

function createQueryWithCountAndSumAggregations() {
  return createQueryWithClauses({
    aggregations: [
      { operatorName: "count" },
      { operatorName: "sum", columnName: "PRICE", tableName: "PRODUCTS" },
    ],
  });
}

function createQueryWithMaxAggregation() {
  return createQueryWithClauses({
    aggregations: [
      { operatorName: "max", tableName: "ORDERS", columnName: "QUANTITY" },
    ],
  });
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

function createQueryWithOpaqueBreakoutAndAggregation() {
  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable({
            fields: [createOrdersIdField(), createOrdersProductIdField()],
          }),
          createProductsTable({
            fields: [createProductsIdField(), createProductsCategoryField()],
          }),
        ],
      }),
    ],
  });

  return createQueryWithClauses({
    query: createQuery({ metadata }),
    aggregations: [{ operatorName: "count" }],
    breakouts: [{ tableName: "PRODUCTS", columnName: "CATEGORY" }],
  });
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
  state?: State;
  metadata?: Metadata;
  query?: Lib.Query;
  allowCustomExpressions?: boolean;
  allowTemporalComparisons?: boolean;
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
  allowCustomExpressions,
  allowTemporalComparisons,
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
      allowCustomExpressions={allowCustomExpressions}
      allowTemporalComparisons={allowTemporalComparisons}
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

      expect(screen.getByText("Summaries")).toBeInTheDocument();

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
      const { getRecentClauseInfo } = setup({ allowCustomExpressions: true });

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
        metadata: createMetadata({ allowCustomExpressions: false }),
      });
      expect(screen.queryByText("Custom Expression")).not.toBeInTheDocument();
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

  // eslint-disable-next-line jest/no-disabled-tests
  describe.skip("column compare shortcut", () => {
    it("does not display the shortcut if there are no aggregations", () => {
      setup({ allowCustomExpressions: true, allowTemporalComparisons: true });
      expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    });

    it("does not display the shortcut if there are no possible breakouts to use", () => {
      setup({
        query: createQueryWithOpaqueBreakoutAndAggregation(),
        allowCustomExpressions: true,
        allowTemporalComparisons: true,
      });
      expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    });

    it("does not display the shortcut if `allowTemporalComparisons` is not set", () => {
      setup({
        query: createQueryWithCountAggregation(),
        allowCustomExpressions: true,
        allowTemporalComparisons: false,
      });
      expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    });

    it("displays the shortcut with correct label if there is 1 aggregation", () => {
      setup({
        query: createQueryWithCountAggregation(),
        allowCustomExpressions: true,
        allowTemporalComparisons: true,
      });
      expect(screen.getByText("Compare to the past")).toBeInTheDocument();
    });

    it("displays the shortcut with correct label if there are multiple aggregation", () => {
      setup({
        query: createQueryWithCountAndSumAggregations(),
        allowCustomExpressions: true,
        allowTemporalComparisons: true,
      });
      expect(screen.getByText("Compare to the past")).toBeInTheDocument();
    });

    it("calls 'onQueryChange' on submit", async () => {
      const { onQueryChange } = setup({
        query: createQueryWithCountAggregation(),
        allowCustomExpressions: true,
        allowTemporalComparisons: true,
      });

      await userEvent.click(screen.getByText("Compare to the past"));
      await userEvent.click(screen.getByText("Done"));

      expect(onQueryChange).toHaveBeenCalled();
    });
  });
});
