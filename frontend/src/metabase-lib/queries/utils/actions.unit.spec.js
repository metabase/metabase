import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { drillFilter } from "metabase-lib/queries/utils/actions";

describe("actions", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const ordersTable = metadata.table(ORDERS_ID);
  const createdAt = metadata.field(ORDERS.CREATED_AT);

  describe("drillFilter", () => {
    it("should add the filter with the same timezone", () => {
      const newQuery = drillFilter(
        ordersTable.query(),
        "2018-04-27T00:00:00.000+02:00",
        createdAt.column({ unit: "day" }),
      );

      expect(newQuery.query()).toEqual({
        "source-table": ORDERS_ID,
        filter: [
          "=",
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
          "2018-04-27T00:00:00+02:00",
        ],
      });
    });
  });
});
