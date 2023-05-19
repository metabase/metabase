import { createMockMetadata } from "__support__/metadata";
import {
  createOrdersTable,
  createOrdersTotalField,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import SummarizeColumnByTimeDrill from "metabase/modes/components/drill/SummarizeColumnByTimeDrill";

describe("SummarizeColumnByTimeDrill", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const ordersTable = metadata.table(ORDERS_ID);

  it("should not be valid for top level actions", () => {
    expect(
      SummarizeColumnByTimeDrill({ question: ordersTable.question() }),
    ).toHaveLength(0);
  });

  it("should not be valid if there is no time field", () => {
    const metadataNoDatetime = createMockMetadata({
      databases: [
        createSampleDatabase({
          tables: [
            createOrdersTable({
              fields: [createOrdersTotalField()],
            }),
          ],
        }),
      ],
    });

    const table = metadataNoDatetime.table(ORDERS_ID);
    const field = metadataNoDatetime.field(ORDERS.TOTAL);

    expect(
      SummarizeColumnByTimeDrill({
        question: table.question(),
        clicked: {
          column: field.column(),
        },
      }),
    ).toHaveLength(0);
  });

  it("should be return correct new card", () => {
    const actions = SummarizeColumnByTimeDrill({
      question: ordersTable.question(),
      clicked: {
        column: metadata.field(ORDERS.TOTAL).column(),
      },
    });
    expect(actions).toHaveLength(1);
    const newQuestion = actions[0].question();
    expect(newQuestion.datasetQuery().query).toEqual({
      "source-table": ORDERS_ID,
      aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    });
    expect(newQuestion.display()).toEqual("line");
  });
});
