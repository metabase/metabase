/* eslint-disable flowtype/require-valid-file-annotation */

import ObjectDetailDrill from "metabase/modes/components/drill/ObjectDetailDrill";

import {
  question,
  clickedFloatValue,
  clickedPKValue,
  clickedFKValue,
  ORDERS,
  PRODUCTS,
} from "__support__/sample_dataset_fixture";

describe("ObjectDetailDrill", () => {
  it("should not be valid non-PK cells", () => {
    expect(
      ObjectDetailDrill({
        question,
        clicked: clickedFloatValue,
      }),
    ).toHaveLength(0);
  });
  it("should be return correct new card for PKs", () => {
    const actions = ObjectDetailDrill({
      question,
      clicked: clickedPKValue,
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      filter: ["=", ["field-id", ORDERS.ID.id], 42],
    });
  });
  it("should be return correct new card for FKs", () => {
    const actions = ObjectDetailDrill({
      question,
      clicked: clickedFKValue,
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": PRODUCTS.id,
      filter: ["=", ["field-id", PRODUCTS.ID.id], 43],
    });
  });
});
