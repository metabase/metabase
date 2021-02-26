/* eslint-disable */

import SummarizeColumnDrill from "metabase/modes/components/drill/SummarizeColumnDrill";

import { ORDERS } from "__support__/sample_dataset_fixture";

describe("SummarizeColumnDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(SummarizeColumnDrill({ question: ORDERS.question() })).toHaveLength(
      0,
    );
  });
  it("should be valid for click on numeric column header", () => {
    const actions = SummarizeColumnDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.TOTAL.column({ source: "fields" }),
      },
    });
    expect(actions.length).toEqual(3);
    let newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["sum", ["field", ORDERS.TOTAL.id, null]]],
    });
    expect(newCard.display).toEqual("scalar");
  });
});
