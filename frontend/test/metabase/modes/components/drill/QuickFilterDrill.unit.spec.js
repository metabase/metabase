/* eslint-disable */

import QuickFilterDrill from "metabase/modes/components/drill/QuickFilterDrill";

import {
  question,
  clickedFloatValue,
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  metadata,
} from "__support__/sample_dataset_fixture";

describe("QuickFilterDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(QuickFilterDrill({ question })).toHaveLength(0);
  });
  it("should be valid for click on numeric cell", () => {
    const actions = QuickFilterDrill({
      question,
      clicked: clickedFloatValue,
    });
    expect(actions.length).toEqual(4);
    let newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS_TABLE_ID,
      filter: ["<", ["field-id", 6], 1234],
    });
    expect(newCard.display).toEqual("table");
  });
  it('should be valid for click on "joined-field" numeric cell ', () => {
    const actions = QuickFilterDrill({
      question,
      clicked: {
        column: {
          ...metadata.field(6),
          field_ref: ["joined-field", "foo", ["field-id", 6]],
          source: "fields",
        },
        value: 1234,
      },
    });
    expect(actions.length).toEqual(4);
    let newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS_TABLE_ID,
      filter: ["<", ["joined-field", "foo", ["field-id", 6]], 1234],
    });
    expect(newCard.display).toEqual("table");
  });
});
