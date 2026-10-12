import { deserializeCardFromUrl } from "metabase/common/utils/card";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { StructuredQuery } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

import {
  getSummaryQuestion,
  getSummaryUrl,
  restoreSummaryParameters,
} from "./question-summary";

interface SetupOpts {
  query?: StructuredQuery;
}
function setup({ query = {} }: SetupOpts = {}) {
  return new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID, ...query },
      },
    }),
    SAMPLE_METADATA,
  );
}

describe("question summaries", () => {
  it("restores serialized parameter values instead of dropping selected values", () => {
    const source = setup().setParameterValues({
      category: ["Widget"],
      price: 10,
    });
    const url = new URL(
      getSummaryUrl(source, "/question#source"),
      "http://localhost",
    );
    const restored = restoreSummaryParameters(
      new Question(deserializeCardFromUrl(url.hash.slice(1)), SAMPLE_METADATA),
    );
    expect(restored._parameterValues).toEqual({
      category: ["Widget"],
      price: 10,
    });
  });

  it("rejects malformed serialized parameter values", () => {
    const question = new Question(
      {
        ...setup().card(),
        parameterValues: { category: { unexpected: true } },
      },
      SAMPLE_METADATA,
    );
    expect(restoreSummaryParameters(question)._parameterValues).toEqual({});
  });

  it("starts an ad hoc count while preserving numeric and text filters and custom columns", () => {
    const source = setup({
      query: {
        filter: [
          "and",
          ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
          [">", ["field", PRODUCTS.PRICE, null], 10],
        ],
        expressions: { Double: ["*", ["field", PRODUCTS.PRICE, null], 2] },
      },
    });
    const summary = getSummaryQuestion(source);
    expect(summary.isSaved()).toBe(false);
    expect(Lib.toLegacyQuery(summary.query())).toMatchObject({
      query: {
        aggregation: [["count"]],
        filter: [
          "and",
          ["=", ["field", PRODUCTS.CATEGORY, expect.anything()], "Widget"],
          [">", ["field", PRODUCTS.PRICE, expect.anything()], 10],
        ],
        expressions: {
          Double: ["*", ["field", PRODUCTS.PRICE, expect.anything()], 2],
        },
      },
    });
    expect(Lib.aggregations(source.query(), -1)).toHaveLength(0);
  });

  it("keeps existing multiple aggregations and grouping", () => {
    const source = setup({
      query: {
        aggregation: [["avg", ["field", PRODUCTS.PRICE, null]], ["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });
    expect(
      Lib.areLegacyQueriesEqual(
        getSummaryQuestion(source).datasetQuery(),
        source.datasetQuery(),
      ),
    ).toBe(true);
  });

  it("preserves the visualization of an existing summary", () => {
    const source = setup({ query: { aggregation: [["count"]] } }).setDisplay(
      "pivot",
    );
    expect(getSummaryQuestion(source).display()).toBe("pivot");
  });

  it("keeps joins when starting a summary", () => {
    const summary = getSummaryQuestion(
      setup({
        query: {
          joins: [
            {
              "source-table": PRODUCTS_ID,
              alias: "Other",
              condition: [
                "=",
                ["field", PRODUCTS.ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Other" }],
              ],
            },
          ],
        },
      }),
    );
    expect(Lib.toLegacyQuery(summary.query())).toMatchObject({
      query: { joins: [{ alias: "Other" }], aggregation: [["count"]] },
    });
  });

  it("serializes the summary separately from the original return question", () => {
    const summary = getSummaryQuestion(setup());
    const url = new URL(
      getSummaryUrl(summary, "/question#original"),
      "http://localhost",
    );
    expect(url.pathname).toBe("/explore");
    expect(url.searchParams.get("mode")).toBe("question");
    expect(url.searchParams.get("returnTo")).toBe("/question#original");
    expect(deserializeCardFromUrl(url.hash.slice(1)).dataset_query).toEqual(
      summary.cardWithNormalizedQuery().dataset_query,
    );
  });
});
