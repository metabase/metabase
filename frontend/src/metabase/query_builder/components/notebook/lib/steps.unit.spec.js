import { createMockMetadata } from "__support__/metadata";
import { getQuestionSteps } from "metabase/query_builder/components/notebook/lib/steps";
import * as Lib from "metabase-lib";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const rawDataQuery = {
  "source-table": ORDERS_ID,
};

const summarizedQuery = {
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

const filteredQuery = {
  ...rawDataQuery,
  filter: ["=", ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }], 1],
};

const filteredAndSummarizedQuery = {
  ...summarizedQuery,
  ...filteredQuery,
};

const postAggregationFilterQuery = {
  "source-query": filteredAndSummarizedQuery,
  filter: [">", ["field", "count", { "base-type": "type/Integer" }], 10],
};

const getQuestionStepsForMBQLQuery = query =>
  getQuestionSteps(
    metadata
      .database(SAMPLE_DB_ID)
      .question()
      .query()
      .setQuery(query)
      .question(),
    metadata,
    {},
  );

describe("new query", () => {
  const steps = getQuestionStepsForMBQLQuery({});

  describe("getQuestionSteps", () => {
    it("should return data step with no actions", () => {
      expect(steps.length).toBe(1);
      expect(steps.map(s => s.type)).toEqual(["data"]);
      expect(steps.map(s => s.actions.map(a => a.type))).toEqual([[]]);
    });
  });
});

describe("raw data query", () => {
  const steps = getQuestionStepsForMBQLQuery(rawDataQuery);

  describe("getQuestionSteps", () => {
    it("should return data step with actions", () => {
      expect(steps.length).toBe(1);
      expect(steps.map(s => s.type)).toEqual(["data"]);
      expect(steps.map(s => s.actions.map(a => a.type))).toEqual([
        ["join", "expression", "filter", "summarize", "sort", "limit"],
      ]);
    });
  });
});

describe("filtered and summarized query", () => {
  const steps = getQuestionStepsForMBQLQuery(filteredAndSummarizedQuery);
  const [_dataStep, filterStep, summarizeStep] = steps;

  describe("getQuestionSteps", () => {
    it("`getQuestionSteps()` should return data, filter, and summarize steps", () => {
      expect(steps.map(s => s.type)).toEqual(["data", "filter", "summarize"]);
    });
  });

  describe("query", () => {
    it("should be the full query for data step", () => {
      expect(steps[0].query.query()).toEqual(filteredAndSummarizedQuery);
    });
    it("should be the full query for filter step", () => {
      expect(steps[1].query.query()).toEqual(filteredAndSummarizedQuery);
    });
    it("should be the full query for summarize step", () => {
      expect(steps[2].query.query()).toEqual(filteredAndSummarizedQuery);
    });
  });

  describe("previewQuery", () => {
    it("shouldn't include filter, summarize for data step", () => {
      expect(steps[0].previewQuery.query()).toEqual(rawDataQuery);
    });
    it("shouldn't include summarize for filter step", () => {
      expect(steps[1].previewQuery.query()).toEqual(filteredQuery);
    });
  });

  describe("revert", () => {
    it("shouldn't remove summarize when removing filter", () => {
      const newQuery = filterStep.revert(filterStep.topLevelQuery);

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(0);
    });

    it("shouldn't remove filter when removing summarize", () => {
      const newQuery = summarizeStep.revert(summarizeStep.topLevelQuery);

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
    });
  });
});

describe("filtered and summarized query with post-aggregation filter", () => {
  const steps = getQuestionStepsForMBQLQuery(postAggregationFilterQuery);
  const [_dataStep, filterStep1, summarizeStep, filterStep2] = steps;

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
    it("should be the source-query for data step", () => {
      expect(steps[0].query.query()).toEqual(filteredAndSummarizedQuery);
    });
    it("should be the source-query for filter step", () => {
      expect(steps[1].query.query()).toEqual(filteredAndSummarizedQuery);
    });
    it("should be the source-query for summarize step", () => {
      expect(steps[2].query.query()).toEqual(filteredAndSummarizedQuery);
    });
    it("should be the original query for post-aggregation filter step", () => {
      expect(steps[3].query.query()).toEqual(postAggregationFilterQuery);
    });
  });

  describe("previewQuery", () => {
    it("shouldn't include filter, summarize, or post-aggregation filter for data step", () => {
      expect(steps[0].previewQuery.query()).toEqual(rawDataQuery);
    });
    it("shouldn't include summarize or post-aggregation filter filter step", () => {
      expect(steps[1].previewQuery.query()).toEqual(filteredQuery);
    });
    it("should be the original query for post-aggregation filter step", () => {
      expect(steps[3].previewQuery.query()).toEqual(postAggregationFilterQuery);
    });
  });

  describe("revert", () => {
    it("shouldn't remove summarize or post-aggregation filter when removing filter", () => {
      const newQuery = filterStep1.revert(filterStep1.topLevelQuery);

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 1)).toHaveLength(1);
    });

    it("should remove post-aggregation filter when removing summarize", () => {
      const newQuery = summarizeStep.revert(summarizeStep.topLevelQuery);

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 1)).toHaveLength(0);
    });

    it("should not remove filter or summarize when removing post-aggregation filter", () => {
      const newQuery = filterStep2.revert(filterStep2.topLevelQuery);

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 1)).toHaveLength(0);
    });
  });
});
