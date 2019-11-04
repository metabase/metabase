/* eslint-disable flowtype/require-valid-file-annotation */

import ObjectDetailDrill from "metabase/modes/components/drill/ObjectDetailDrill";

import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

describe("ObjectDetailDrill", () => {
  it("should not be valid non-PK cells", () => {
    expect(
      ObjectDetailDrill({
        question: ORDERS.question(),
        clicked: {
          column: ORDERS.TOTAL.column(),
          value: 42,
        },
      }),
    ).toHaveLength(0);
  });
  it("should be return correct new card for PKs", () => {
    const actions = ObjectDetailDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.ID.column(),
        value: 42,
      },
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
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.PRODUCT_ID.column(),
        value: 42,
      },
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": PRODUCTS.id,
      filter: ["=", ["field-id", PRODUCTS.ID.id], 42],
    });
  });
});
