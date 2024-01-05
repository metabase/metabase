import { createMockMetadata } from "__support__/metadata";
import { getQuestionSteps } from "metabase/query_builder/components/notebook/lib/steps";
import { checkNotNull } from "metabase/lib/types";
import type { StructuredQuery as StructuredQueryObject } from "metabase-types/api";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const database = checkNotNull(metadata.database(SAMPLE_DB_ID));

const rawDataQuery: StructuredQueryObject = {
  "source-table": ORDERS_ID,
};

const summarizedQuery: StructuredQueryObject = {
  ...rawDataQuery,
  aggregation: [["count"]],
  breakout: [
    [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID, "base-type": "type/Integer" },
    ],
  ],
};

const filteredQuery: StructuredQueryObject = {
  ...rawDataQuery,
  filter: ["=", ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }], 1],
};

const filteredAndSummarizedQuery: StructuredQueryObject = {
  ...summarizedQuery,
  ...filteredQuery,
};

const postAggregationFilterQuery: StructuredQueryObject = {
  "source-query": filteredAndSummarizedQuery,
  filter: [">", ["field", "count", { "base-type": "type/Integer" }], 10],
};

const getQuestionStepsForMBQLQuery = (query: StructuredQueryObject) => {
  const question = database.question(query);
  return getQuestionSteps(question, metadata, {});
};

describe("raw data query", () => {
  const steps = getQuestionStepsForMBQLQuery(rawDataQuery);
  const [dataStep] = steps;

  describe("getQuestionSteps", () => {
    it("should return data step with actions", () => {
      expect(steps.length).toBe(1);
      expect(dataStep.type).toBe("data");
      expect(dataStep.actions.map(action => action.type)).toEqual([
        "join",
        "expression",
        "filter",
        "summarize",
        "sort",
        "limit",
      ]);
    });
  });
});

describe("filtered and summarized query", () => {
  const steps = getQuestionStepsForMBQLQuery(filteredAndSummarizedQuery);
  const [dataStep, filterStep, summarizeStep] = steps;

  describe("getQuestionSteps", () => {
    it("`getQuestionSteps()` should return data, filter, and summarize steps", () => {
      expect(steps.map(s => s.type)).toEqual(["data", "filter", "summarize"]);
    });
  });

  describe("query", () => {
    it("should be the same for all steps", () => {
      const { topLevelQuery } = dataStep;

      expect(filterStep.topLevelQuery).toBe(topLevelQuery);
      expect(summarizeStep.topLevelQuery).toBe(topLevelQuery);
    });
  });

  describe("previewQuery", () => {
    it("shouldn't include filter, summarize for data step", () => {
      const previewQuery = checkNotNull(dataStep.previewQuery);

      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(0);
    });

    it("shouldn't include summarize for filter step", () => {
      const previewQuery = checkNotNull(filterStep.previewQuery);

      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(1);
    });
  });

  describe("revert", () => {
    it("shouldn't remove summarize when removing filter", () => {
      const newQuery = checkNotNull(
        filterStep.revert?.(filterStep.topLevelQuery, 0),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(0);
    });

    it("shouldn't remove filter when removing summarize", () => {
      const newQuery = checkNotNull(
        summarizeStep.revert?.(summarizeStep.topLevelQuery, 0),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
    });
  });
});

describe("filtered and summarized query with post-aggregation filter", () => {
  const steps = getQuestionStepsForMBQLQuery(postAggregationFilterQuery);
  const [dataStep, filterStep, summarizeStep, postAggregationFilterStep] =
    steps;

  describe("getQuestionSteps", () => {
    it("`getQuestionSteps()` should return data, filter, summarize, and filter steps", () => {
      expect(steps.map(s => s.type)).toEqual([
        "data",
        "filter",
        "summarize",
        "filter",
      ]);
    });
  });

  describe("query", () => {
    it("should be the same for all steps", () => {
      const { topLevelQuery } = dataStep;

      expect(filterStep.topLevelQuery).toBe(topLevelQuery);
      expect(summarizeStep.topLevelQuery).toBe(topLevelQuery);
      expect(postAggregationFilterStep.topLevelQuery).toBe(topLevelQuery);
    });
  });

  describe("previewQuery", () => {
    it("shouldn't include filter, summarize, or post-aggregation filter for data step", () => {
      const previewQuery = checkNotNull(dataStep.previewQuery);

      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 1)).toHaveLength(0);
    });

    it("shouldn't include summarize or post-aggregation filter for filter step", () => {
      const previewQuery = checkNotNull(filterStep.previewQuery);

      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(1);
      expect(Lib.filters(previewQuery, 1)).toHaveLength(0);
    });

    it("should be the original query for post-aggregation filter step", () => {
      const previewQuery = checkNotNull(postAggregationFilterStep.previewQuery);

      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(1);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(1);
      expect(Lib.filters(previewQuery, 1)).toHaveLength(1);
    });
  });

  describe("revert", () => {
    it("shouldn't remove summarize or post-aggregation filter when removing filter", () => {
      const newQuery = checkNotNull(
        filterStep.revert?.(filterStep.topLevelQuery, 0),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 1)).toHaveLength(1);
    });

    it("should remove post-aggregation filter when removing summarize", () => {
      const newQuery = checkNotNull(
        summarizeStep.revert?.(summarizeStep.topLevelQuery, 0),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 1)).toHaveLength(0);
    });

    it("should not remove filter or summarize when removing post-aggregation filter", () => {
      const newQuery = checkNotNull(
        postAggregationFilterStep.revert?.(
          postAggregationFilterStep.topLevelQuery,
          1,
        ),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 1)).toHaveLength(0);
    });
  });
});
