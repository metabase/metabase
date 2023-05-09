import { createMockMetadata } from "__support__/metadata";
import ZoomDrill from "metabase/modes/components/drill/ZoomDrill";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

describe("ZoomDrill", () => {
  it("should not be valid for top level actions", () => {
    const question = ordersTable.newQuestion();
    const actions = ZoomDrill({ question });
    expect(actions).toHaveLength(0);
  });

  it("should be return correct new for month -> week", () => {
    const query = ordersTable
      .query()
      .aggregate(["count"])
      .breakout(["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]);

    const actions = ZoomDrill({
      question: query.question(),
      clicked: {
        column: query.aggregationDimensions()[0].column(),
        value: 42,
        dimensions: [
          {
            column: metadata.field(ORDERS.CREATED_AT).column({ unit: "month" }),
            value: "2018-01-01T00:00:00Z",
          },
        ],
      },
    });
    expect(actions).toHaveLength(1);
    const question = actions[0].question();
    expect(question.datasetQuery().query).toEqual({
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      filter: [
        "=",
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        "2018-01-01T00:00:00Z",
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
    });
    expect(question.display()).toEqual("line");
  });
});
