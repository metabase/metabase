/* eslint-disable flowtype/require-valid-file-annotation */

import { ORDERS } from "__support__/sample_dataset_fixture";

import SortAction from "metabase/modes/components/drill/SortAction";

// shortcut get the dataset_query's query from an action
const query = action =>
  action
    .question()
    .query()
    .query();

describe("SortAction", () => {
  it("should not be valid for top level actions", () => {
    expect(SortAction({ question: ORDERS.question() })).toHaveLength(0);
  });

  it("should return ascending and descending for unsorted column", () => {
    const actions = SortAction({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.CREATED_AT.column(),
      },
    });
    expect(actions).toHaveLength(2);
    expect(actions[0].title).toEqual("Ascending");
    expect(actions[1].title).toEqual("Descending");

    expect(query(actions[0])).toEqual({
      "source-table": ORDERS.id,
      "order-by": [["asc", ["field-id", 1]]],
    });
    expect(query(actions[1])).toEqual({
      "source-table": ORDERS.id,
      "order-by": [["desc", ["field-id", 1]]],
    });
  });

  it("should return ascending for an already sorted column", () => {
    const actions = SortAction({
      question: ORDERS.query()
        .sort(["asc", ["field-id", ORDERS.CREATED_AT.id]])
        .question(),
      clicked: {
        column: ORDERS.CREATED_AT.column(),
      },
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toEqual("Descending");
    expect(query(actions[0])).toEqual({
      "source-table": ORDERS.id,
      "order-by": [["desc", ["field-id", 1]]],
    });
  });

  it("should sort by aggregation", () => {
    const q = ORDERS.query()
      .aggregate(["count"])
      .breakout(ORDERS.CREATED_AT);
    const actions = SortAction({
      question: q.question(),
      clicked: {
        column: q.aggregationDimensions()[0].column(),
      },
    });
    expect(query(actions[0])).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["count"]],
      breakout: [["field-id", ORDERS.CREATED_AT.id]],
      "order-by": [["asc", ["aggregation", 0]]],
    });
  });

  it("should sort by breakout", () => {
    const actions = SortAction({
      question: ORDERS.query()
        .aggregate(["count"])
        .breakout(ORDERS.CREATED_AT)
        .question(),
      clicked: {
        column: ORDERS.CREATED_AT.column({ source: "breakout" }),
      },
    });
    expect(query(actions[0])).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["count"]],
      breakout: [["field-id", ORDERS.CREATED_AT.id]],
      "order-by": [["asc", ["field-id", 1]]],
    });
  });
});
