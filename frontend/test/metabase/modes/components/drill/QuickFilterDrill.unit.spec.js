/* eslint-disable */

import QuickFilterDrill from "metabase/modes/components/drill/QuickFilterDrill";

import { ORDERS } from "__support__/sample_dataset_fixture";

describe("QuickFilterDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(QuickFilterDrill({ question: ORDERS.question() })).toHaveLength(0);
  });
  it("should be valid for click on numeric cell", () => {
    const actions = QuickFilterDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.TOTAL.column(),
        value: 42,
      },
    });
    expect(actions.length).toEqual(4);
    let newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      filter: ["<", ["field-id", ORDERS.TOTAL.id], 42],
    });
    expect(newCard.display).toEqual("table");
  });
  it('should be valid for click on "joined-field" numeric cell ', () => {
    const actions = QuickFilterDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.TOTAL.column({
          field_ref: ["joined-field", "foo", ["field-id", ORDERS.TOTAL.id]],
        }),
        value: 42,
      },
    });
    expect(actions.length).toEqual(4);
    let newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      filter: ["<", ["joined-field", "foo", ["field-id", ORDERS.TOTAL.id]], 42],
    });
    expect(newCard.display).toEqual("table");
  });
});
