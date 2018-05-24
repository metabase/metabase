/* eslint-disable flowtype/require-valid-file-annotation */

import CountByColumnDrill from "metabase/qb/components/drill/CountByColumnDrill";

import {
  productQuestion,
  clickedCategoryHeader,
  PRODUCT_TABLE_ID,
  PRODUCT_CATEGORY_FIELD_ID,
} from "__support__/sample_dataset_fixture";

describe("CountByColumnDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(CountByColumnDrill({ productQuestion })).toHaveLength(0);
  });
  it("should be valid for click on numeric column header", () => {
    expect(
      CountByColumnDrill({
        question: productQuestion,
        clicked: clickedCategoryHeader,
      }),
    ).toHaveLength(1);
  });
  it("should be return correct new card", () => {
    const actions = CountByColumnDrill({
      question: productQuestion,
      clicked: clickedCategoryHeader,
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      source_table: PRODUCT_TABLE_ID,
      aggregation: [["count"]],
      breakout: [["field-id", PRODUCT_CATEGORY_FIELD_ID]],
    });
    expect(newCard.display).toEqual("bar");
  });
});
