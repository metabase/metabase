import { createMockMetadata } from "__support__/metadata";
import { getQueryMode } from "metabase/modes/lib/modes";
import SegmentMode from "metabase/modes/components/modes/SegmentMode";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

describe("modes", () => {
  describe("getQueryMode", () => {
    it("should be in segment mode when selecting one PK ID", () => {
      const filter = ["=", ["field", ORDERS.ID, null], 42];
      const query = ordersTable.query().filter(filter);
      const question = ordersTable.question().setQuery(query);
      expect(getQueryMode(question)).toBe(SegmentMode);
    });

    it("should be in segment mode when selecting multiple PK IDs", () => {
      const filter = ["=", ["field", ORDERS.ID, null], 42, 24];
      const query = ordersTable.query().filter(filter);
      const question = ordersTable.question().setQuery(query);
      expect(getQueryMode(question)).toBe(SegmentMode);
    });
  });
});
