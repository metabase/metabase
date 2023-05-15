import { ORDERS, createMetadata } from "__support__/sample_database_fixture";

import SummarizeColumnByTimeDrill from "metabase/modes/components/drill/SummarizeColumnByTimeDrill";

describe("SummarizeColumnByTimeDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(
      SummarizeColumnByTimeDrill({ question: ORDERS.question() }),
    ).toHaveLength(0);
  });
  it("should not be valid if there is no time field", () => {
    const metadata = createMetadata(state =>
      state.assocIn(
        ["entities", "tables", ORDERS.id, "fields"],
        [ORDERS.TOTAL.id],
      ),
    );
    const ORDERS_NO_DATETIME = metadata.table(ORDERS.id);
    expect(
      SummarizeColumnByTimeDrill({
        question: ORDERS_NO_DATETIME.question(),
        clicked: {
          column: ORDERS_NO_DATETIME.TOTAL.column(),
        },
      }),
    ).toHaveLength(0);
  });
  it("should be return correct new card", () => {
    const actions = SummarizeColumnByTimeDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.TOTAL.column(),
      },
    });
    expect(actions).toHaveLength(1);
    const newQuestion = actions[0].question();
    expect(newQuestion.datasetQuery().query).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["sum", ["field", ORDERS.TOTAL.id, null]]],
      breakout: [["field", ORDERS.CREATED_AT.id, { "temporal-unit": "day" }]],
    });
    expect(newQuestion.display()).toEqual("line");
  });
});
