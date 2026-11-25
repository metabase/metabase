import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getSummaryQuestion } from "./SummarySidebar/summary-session";
import { getCardSummarySession } from "./card-summary-session";

type TestQuerySpec = Parameters<typeof Lib.createTestQuery>[1];

function createQuestion(stage: TestQuerySpec["stages"][0]) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, { stages: [stage] });
  return new Question(
    createMockCard({ dataset_query: Lib.toJsQuery(query), display: "bar" }),
    SAMPLE_METADATA,
  );
}

describe("getCardSummarySession", () => {
  it("should read the card's aggregations and breakouts into the bins", () => {
    const question = createQuestion({
      source: { type: "table", id: ORDERS_ID },
      aggregations: [
        { type: "operator", operator: "count", args: [] },
        {
          type: "operator",
          operator: "sum",
          args: [{ type: "column", name: "TOTAL" }],
        },
      ],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    });

    const session = getCardSummarySession(question);

    expect(session.definition.rows).toHaveLength(0);
    expect(session.definition.columns).toHaveLength(1);
    expect(session.definition.values.map((value) => value.type)).toEqual([
      "count",
      "column",
    ]);
    expect(Lib.aggregations(session.base.query, -1)).toHaveLength(0);
    expect(Lib.breakouts(session.base.query, -1)).toHaveLength(0);
  });

  it("should build the same summary back from the bins", () => {
    const question = createQuestion({
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    });

    const summaryQuestion = getSummaryQuestion(getCardSummarySession(question));
    if (summaryQuestion == null) {
      throw new Error("The summary should build a question");
    }
    const summaryQuery = summaryQuestion.query();

    expect(Lib.stageCount(summaryQuery)).toBe(1);
    expect(Lib.aggregations(summaryQuery, -1)).toHaveLength(1);
    expect(Lib.breakouts(summaryQuery, -1)).toHaveLength(1);
  });

  it("should start with empty bins for a card that is not summarized", () => {
    const question = createQuestion({
      source: { type: "table", id: ORDERS_ID },
    });

    const { definition } = getCardSummarySession(question);

    expect(definition.values).toHaveLength(0);
    expect(definition.columns).toHaveLength(0);
  });
});
