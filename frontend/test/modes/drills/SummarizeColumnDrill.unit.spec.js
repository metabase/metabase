/* eslint-disable */

import SummarizeColumnDrill from "metabase/qb/components/drill/SummarizeColumnDrill";

import {
  question,
  clickedFloatHeader,
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
} from "__support__/sample_dataset_fixture";

describe("SummarizeColumnDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(SummarizeColumnDrill({ question })).toHaveLength(0);
  });
  it("should be valid for click on numeric column header", () => {
    const actions = SummarizeColumnDrill({
      question,
      clicked: clickedFloatHeader,
    });
    expect(actions.length).toEqual(5);
    let newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS_TABLE_ID,
      aggregation: [["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]]],
    });
    expect(newCard.display).toEqual("scalar");
  });
});
