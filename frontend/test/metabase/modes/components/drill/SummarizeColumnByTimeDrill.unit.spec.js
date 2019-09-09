/* eslint-disable flowtype/require-valid-file-annotation */

import {
  question,
  questionNoFields,
  clickedFloatHeader,
  ORDERS,
} from "__support__/sample_dataset_fixture";

import SummarizeColumnByTimeDrill from "metabase/modes/components/drill/SummarizeColumnByTimeDrill";

describe("SummarizeColumnByTimeDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(SummarizeColumnByTimeDrill({ question })).toHaveLength(0);
  });
  it("should not be valid if there is no time field", () => {
    expect(
      SummarizeColumnByTimeDrill({
        question: questionNoFields,
        clicked: clickedFloatHeader,
      }),
    ).toHaveLength(0);
  });
  it("should be return correct new card", () => {
    const actions = SummarizeColumnByTimeDrill({
      question: question,
      clicked: clickedFloatHeader,
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["sum", ["field-id", ORDERS.TOTAL.id]]],
      breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "day"]],
    });
    expect(newCard.display).toEqual("line");
  });
});
