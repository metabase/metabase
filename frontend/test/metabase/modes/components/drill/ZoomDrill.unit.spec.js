import { ORDERS } from "__support__/sample_dataset_fixture";

import ZoomDrill from "metabase/modes/components/drill/ZoomDrill";

describe("ZoomDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(ZoomDrill({ question: ORDERS.newQuestion() })).toHaveLength(0);
  });
  it("should be return correct new for month -> week", () => {
    const query = ORDERS.query()
      .aggregate(["count"])
      .breakout(["field", ORDERS.CREATED_AT.id, { "temporal-unit": "month" }]);

    const actions = ZoomDrill({
      question: query.question(),
      clicked: {
        column: query.aggregationDimensions()[0].column(),
        value: 42,
        dimensions: [
          {
            column: ORDERS.CREATED_AT.column({ unit: "month" }),
            value: "2018-01-01T00:00:00Z",
          },
        ],
      },
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["count"]],
      filter: [
        "=",
        ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "month" }],
        "2018-01-01T00:00:00Z",
      ],
      breakout: [["field", ORDERS.CREATED_AT.id, { "temporal-unit": "week" }]],
    });
    expect(newCard.display).toEqual("line");
  });
});
