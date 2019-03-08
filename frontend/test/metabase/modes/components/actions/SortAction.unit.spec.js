/* eslint-disable flowtype/require-valid-file-annotation */

import {
  question,
  clickedCreatedAtHeader,
  countByCreatedAtQuestion,
  clickedCountAggregationHeader,
  clickedCreatedAtBreakoutHeader,
  ORDERS_TABLE_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import SortAction from "metabase/modes/components/drill/SortAction";

// shortcut get the dataset_query's query from an action
const query = action =>
  action
    .question()
    .query()
    .query();

describe("SortAction", () => {
  it("should not be valid for top level actions", () => {
    expect(SortAction({ question })).toHaveLength(0);
  });

  it("should return ascending and descending for unsorted column", () => {
    const actions = SortAction({
      question,
      clicked: clickedCreatedAtHeader,
    });
    expect(actions).toHaveLength(2);
    expect(actions[0].title).toEqual("Ascending");
    expect(actions[1].title).toEqual("Descending");

    expect(query(actions[0])).toEqual({
      "order-by": [["asc", ["field-id", 1]]],
      "source-table": 1,
    });
    expect(query(actions[1])).toEqual({
      "order-by": [["desc", ["field-id", 1]]],
      "source-table": 1,
    });
  });

  it("should return ascending for an already sorted column", () => {
    const actions = SortAction({
      question: question
        .query()
        .addSort(["asc", ["field-id", ORDERS_CREATED_DATE_FIELD_ID]])
        .question(),
      clicked: clickedCreatedAtHeader,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toEqual("Descending");
    expect(query(actions[0])).toEqual({
      "order-by": [["desc", ["field-id", 1]]],
      "source-table": 1,
    });
  });

  it("should sort by aggregation", () => {
    const actions = SortAction({
      question: countByCreatedAtQuestion,
      clicked: clickedCountAggregationHeader,
    });
    expect(query(actions[0])).toEqual({
      aggregation: [["count"]],
      breakout: [["field-id", ORDERS_CREATED_DATE_FIELD_ID]],
      "order-by": [["asc", ["aggregation", 0]]],
      "source-table": ORDERS_TABLE_ID,
    });
  });

  it("should sort by breakout", () => {
    const actions = SortAction({
      question: countByCreatedAtQuestion,
      clicked: clickedCreatedAtBreakoutHeader,
    });
    expect(query(actions[0])).toEqual({
      aggregation: [["count"]],
      breakout: [["field-id", ORDERS_CREATED_DATE_FIELD_ID]],
      "order-by": [["asc", ["field-id", 1]]],
      "source-table": ORDERS_TABLE_ID,
    });
  });
});
