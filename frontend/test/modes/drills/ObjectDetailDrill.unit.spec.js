/* eslint-disable flowtype/require-valid-file-annotation */

import ObjectDetailDrill from "metabase/qb/components/drill/ObjectDetailDrill";

import {
  question,
  clickedFloatValue,
  clickedPKValue,
  clickedFKValue,
  ORDERS_TABLE_ID,
  PRODUCT_TABLE_ID,
  ORDERS_PK_FIELD_ID,
  PRODUCT_PK_FIELD_ID,
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
      "source-table": ORDERS_TABLE_ID,
      filter: ["=", ["field-id", ORDERS_PK_FIELD_ID], 42],
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
      "source-table": PRODUCT_TABLE_ID,
      filter: ["=", ["field-id", PRODUCT_PK_FIELD_ID], 43],
    });
  });
});
