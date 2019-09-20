/* eslint-disable flowtype/require-valid-file-annotation */

import { ORDERS, createMetadata } from "__support__/sample_dataset_fixture";

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
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["sum", ["field-id", ORDERS.TOTAL.id]]],
      breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "day"]],
    });
    expect(newCard.display).toEqual("line");
  });
});
