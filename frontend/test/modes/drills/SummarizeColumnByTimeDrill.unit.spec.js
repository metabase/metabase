/* eslint-disable flowtype/require-valid-file-annotation */

import {
  question,
  questionNoFields,
  clickedFloatHeader,
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import SummarizeColumnByTimeDrill from "metabase/qb/components/drill/SummarizeColumnByTimeDrill";

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
    expect(actions).toHaveLength(2);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      source_table: ORDERS_TABLE_ID,
      aggregation: [["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]]],
      breakout: [
        ["datetime-field", ["field-id", ORDERS_CREATED_DATE_FIELD_ID], "day"],
      ],
    });
    expect(newCard.display).toEqual("line");
  });
});
