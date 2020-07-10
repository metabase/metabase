import { generateQueryDescription } from "metabase/lib/query/description";

import { ORDERS } from "__support__/sample_dataset_fixture";

const mockTableMetadata = {
  display_name: "Order",
  fields: [{ id: 1, display_name: "Total" }],
};

describe("generateQueryDescription", () => {
  it("should work with multiple aggregations", () => {
    expect(
      generateQueryDescription(mockTableMetadata, {
        "source-table": ORDERS.id,
        aggregation: [["count"], ["sum", ["field-id", 1]]],
      }),
    ).toEqual("Orders, Count and Sum of Total");
  });
  it("should work with named aggregations", () => {
    expect(
      generateQueryDescription(mockTableMetadata, {
        "source-table": ORDERS.id,
        aggregation: [
          [
            "aggregation-options",
            ["sum", ["field-id", 1]],
            { "display-name": "Revenue" },
          ],
        ],
      }),
    ).toEqual("Orders, Revenue");
  });
});
