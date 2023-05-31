import _ from "underscore";
import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { render, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/core/utils/types";

import type { Metric, StructuredDatasetQuery } from "metabase-types/api";
import {
  createMockMetric,
  COMMON_DATABASE_FEATURES,
} from "metabase-types/api/mocks";
import {
  createAdHocCard,
  createSampleDatabase,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import {
  createQuery,
  columnFinder,
  findAggregationOperator,
} from "metabase-lib/test-helpers";

import { AggregationPicker } from "./AggregationPicker";

function createQueryWithCountAggregation() {
  const initialQuery = createQuery();
  const count = findAggregationOperator(initialQuery, "count");
  const clause = Lib.aggregationClause(count);
  return Lib.aggregate(initialQuery, 0, clause);
}

function createQueryWithMaxAggregation() {
  const initialQuery = createQuery();
  const max = findAggregationOperator(initialQuery, "max");
  const findColumn = columnFinder(
    initialQuery,
    Lib.aggregationOperatorColumns(max),
  );
  const quantity = findColumn("ORDERS", "QUANTITY");
  const clause = Lib.aggregationClause(max, quantity);
  return Lib.aggregate(initialQuery, 0, clause);
}

const TEST_METRIC = createMockMetric({
  id: 1,
  table_id: ORDERS_ID,
  name: "Total Order Value",
  description: "The total value of all orders",
  definition: {
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    "source-table": ORDERS_ID,
  },
});

const ARCHIVED_METRIC = createMockMetric({
  id: 2,
  table_id: ORDERS_ID,
  name: "Archived Metric",
  archived: true,
});

const PRODUCT_METRIC = createMockMetric({
  id: 3,
  table_id: PRODUCTS_ID,
  name: "Average Rating",
  definition: {
    aggregation: [["avg", ["field", PRODUCTS.RATING, null]]],
    "source-table": PRODUCTS_ID,
  },
});

type SetupOpts = {
  query?: Lib.Query;
  metrics?: Metric[];
  hasExpressionSupport?: boolean;
};

function setup({
  query = createQuery(),
  metrics = [],
  hasExpressionSupport = true,
}: SetupOpts = {}) {
  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable({ metrics }),
          createPeopleTable(),
          createProductsTable({ metrics: [PRODUCT_METRIC] }),
          createReviewsTable(),
        ],
        features: hasExpressionSupport
          ? COMMON_DATABASE_FEATURES
          : _.without(COMMON_DATABASE_FEATURES, "expression-aggregations"),
      }),
    ],
    metrics: [...metrics, PRODUCT_METRIC],
  });

  const dataset_query = Lib.toLegacyQuery(query) as StructuredDatasetQuery;
  const question = new Question(createAdHocCard({ dataset_query }), metadata);
  const legacyQuery = question.query() as StructuredQuery;

  const clause = Lib.aggregations(query, 0)[0];

  const baseOperators = Lib.availableAggregationOperators(query, 0);
  const operators = clause
    ? Lib.selectedAggregationOperators(baseOperators, clause)
    : baseOperators;

  const onSelect = jest.fn();
  const onSelectLegacy = jest.fn();

  function handleSelect(clause: Lib.AggregationClause) {
    const nextQuery = Lib.aggregate(query, 0, clause);
    const aggregations = Lib.aggregations(nextQuery, 0);
    const recentAggregation = aggregations[aggregations.length - 1];
    onSelect(Lib.displayInfo(nextQuery, 0, recentAggregation));
  }

  render(
    <AggregationPicker
      query={query}
      legacyQuery={legacyQuery}
      stageIndex={0}
      operators={operators}
      onSelect={handleSelect}
      onSelectLegacy={onSelectLegacy}
    />,
  );

  function getRecentClause() {
    const [lastCall] = onSelect.mock.calls.slice(-1);
    return lastCall?.[0];
  }

  return { metadata, getRecentClause, onSelectLegacy };
}

describe("AggregationPicker", () => {
  it("should allow switching between aggregation approaches", () => {
    const { metadata, onSelectLegacy } = setup({
      query: createQueryWithCountAggregation(),
      metrics: [TEST_METRIC],
    });
    const metric = checkNotNull(metadata.metric(TEST_METRIC.id));

    userEvent.click(screen.getByText("Common Metrics"));
    userEvent.click(screen.getByText(TEST_METRIC.name));

    expect(onSelectLegacy).toHaveBeenCalledWith(metric.aggregationClause());
  });

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

    it("should show operator descriptions", () => {
      setup();

      const sumOfOption = screen.getByRole("option", { name: "Sum of ..." });
      const infoIcon = within(sumOfOption).getByRole("img", {
        name: "question icon",
      });
      userEvent.hover(infoIcon);

      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Sum of all the values of a column",
      );
    });

    it("should apply a column-less operator", () => {
      const { getRecentClause } = setup();

      userEvent.click(screen.getByText("Count of rows"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "count",
          displayName: "Count",
        }),
      );
    });

    it("should apply an operator requiring columns", () => {
      const { getRecentClause } = setup();

      userEvent.click(screen.getByText("Average of ..."));
      userEvent.click(screen.getByText("Quantity"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "avg",
          displayName: "Average of Quantity",
        }),
      );
    });

    it("should allow picking a foreign column", () => {
      const { getRecentClause } = setup();

      userEvent.click(screen.getByText("Average of ..."));
      userEvent.click(screen.getByText("Product"));
      userEvent.click(screen.getByText("Rating"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "avg",
          displayName: "Average of Rating",
        }),
      );
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

    it("shouldn't list columns for column-less operators", () => {
      setup();

      userEvent.click(screen.getByText("Count of rows"));

      expect(screen.queryByText("Quantity")).not.toBeInTheDocument();
      // check that we're still in the same step
      expect(screen.getByText("Average of ...")).toBeInTheDocument();
    });

    it("should allow to change an operator for existing aggregation", () => {
      const { getRecentClause } = setup({
        query: createQueryWithMaxAggregation(),
      });

      userEvent.click(screen.getByText("Maximum of ...")); // go back
      userEvent.click(screen.getByText("Average of ..."));
      userEvent.click(screen.getByText("Quantity"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "avg",
          displayName: "Average of Quantity",
        }),
      );
    });

    it("should allow to change a column for existing aggregation", () => {
      const { getRecentClause } = setup({
        query: createQueryWithMaxAggregation(),
      });

      userEvent.click(screen.getByText("Discount"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "max",
          displayName: "Max of Discount",
        }),
      );
    });
  });

  describe("metrics", () => {
    function setupMetrics(opts: SetupOpts = {}) {
      const result = setup(opts);

      // Expand the metrics section
      userEvent.click(screen.getByText("Common Metrics"));

      return result;
    }

    it("shouldn't show the metrics section when there're no metics", () => {
      setup({ metrics: [] });
      expect(screen.queryByText("Common Metrics")).not.toBeInTheDocument();
    });

    it("should list metrics for the query table", () => {
      setupMetrics({ metrics: [TEST_METRIC] });
      expect(screen.getByText(TEST_METRIC.name)).toBeInTheDocument();
    });

    it("shouldn't list metrics for other tables", () => {
      setupMetrics({ metrics: [TEST_METRIC] });
      expect(screen.queryByText(PRODUCT_METRIC.name)).not.toBeInTheDocument();
    });

    it("should show a description for each metric", () => {
      setupMetrics({ metrics: [TEST_METRIC] });

      const metricOption = screen.getByRole("option", {
        name: TEST_METRIC.name,
      });
      const infoIcon = within(metricOption).getByRole("img", {
        name: "question icon",
      });
      userEvent.hover(infoIcon);

      expect(screen.getByRole("tooltip")).toHaveTextContent(
        TEST_METRIC.description,
      );
    });

    it("shouldn't display archived metrics", () => {
      setupMetrics({ metrics: [TEST_METRIC, ARCHIVED_METRIC] });
      expect(screen.queryByText(ARCHIVED_METRIC.name)).not.toBeInTheDocument();
    });

    it("should allow picking a metric", () => {
      const { metadata, onSelectLegacy } = setupMetrics({
        metrics: [TEST_METRIC],
      });
      const metric = checkNotNull(metadata.metric(TEST_METRIC.id));

      userEvent.click(screen.getByText(TEST_METRIC.name));

      expect(onSelectLegacy).toHaveBeenCalledWith(metric.aggregationClause());
    });
  });

  describe("custom expressions", () => {
    it("should allow to enter a custom expression", async () => {
      const { onSelectLegacy } = setup();

      userEvent.click(screen.getByText("Custom Expression"));
      userEvent.type(screen.getByLabelText("Expression"), "1 + 1");
      userEvent.type(screen.getByLabelText("Name"), "My expression");
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      await waitFor(() =>
        expect(onSelectLegacy).toHaveBeenCalledWith([
          "aggregation-options",
          ["+", 1, 1],
          { "display-name": "My expression", name: "My expression" },
        ]),
      );
    });

    it("shouldn't be available if database doesn't support custom expressions", () => {
      setup({ hasExpressionSupport: false });
      expect(screen.queryByText("Custom Expression")).not.toBeInTheDocument();
    });
  });
});
