import { createMockMetadata } from "__support__/metadata";
import SummarizeColumnDrill from "metabase/modes/components/drill/SummarizeColumnDrill";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

describe("SummarizeColumnDrill", () => {
  it("should not be valid for top level actions", () => {
    const question = ordersTable.question();
    const actions = SummarizeColumnDrill({ question });
    expect(actions).toHaveLength(0);
  });

  it("should be valid for click on numeric column header", () => {
    const actions = SummarizeColumnDrill({
      question: ordersTable.question(),
      clicked: {
        column: metadata.field(ORDERS.TOTAL).column({ source: "fields" }),
      },
    });
    expect(actions.length).toEqual(3);

    const question = actions[0].question();
    expect(question.datasetQuery().query).toEqual({
      "source-table": ORDERS_ID,
      aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    });
    expect(question.display()).toEqual("scalar");
  });
});
