import { cardApi } from "metabase/api";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import {
  maybeUsePivotEndpoint,
  shouldUsePivotEndpoint,
} from "./query-endpoints";

const structuredQuery = createMockStructuredDatasetQuery({
  database: SAMPLE_DB_ID,
  query: { "source-table": ORDERS_ID },
});

const buildQuestion = (card: Parameters<typeof createMockCard>[0]) =>
  new Question(createMockCard(card), SAMPLE_METADATA);

describe("shouldUsePivotEndpoint", () => {
  it("is true for a pivot table on a database that supports pivots", () => {
    const question = buildQuestion({
      display: "pivot",
      dataset_query: structuredQuery,
    });

    expect(shouldUsePivotEndpoint(question)).toBe(true);
  });

  it("is false for any other display", () => {
    const question = buildQuestion({
      display: "table",
      dataset_query: structuredQuery,
    });

    expect(shouldUsePivotEndpoint(question)).toBe(false);
  });

  // `question.database()` resolves through Lib and throws for query types Lib
  // does not support, so a native card must never reach it.
  it("is false for a native card without resolving its database", () => {
    const question = buildQuestion({
      display: "pivot",
      dataset_query: createMockNativeDatasetQuery({
        database: SAMPLE_DB_ID,
        native: { query: "select 1" },
      }),
    });

    expect(shouldUsePivotEndpoint(question)).toBe(false);
  });
});

describe("maybeUsePivotEndpoint", () => {
  it("swaps in the pivot mirror of an endpoint for a pivot card", () => {
    const question = buildQuestion({
      display: "pivot",
      dataset_query: structuredQuery,
    });

    expect(
      maybeUsePivotEndpoint(cardApi.endpoints.getCardQuery, question),
    ).toBe(cardApi.endpoints.getCardQueryPivot);
  });

  it("leaves the endpoint alone otherwise", () => {
    const question = buildQuestion({
      display: "table",
      dataset_query: structuredQuery,
    });

    expect(
      maybeUsePivotEndpoint(cardApi.endpoints.getCardQuery, question),
    ).toBe(cardApi.endpoints.getCardQuery);
  });
});
