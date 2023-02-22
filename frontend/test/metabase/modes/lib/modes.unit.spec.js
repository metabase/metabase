import { getQueryMode } from "metabase/modes/lib/modes";
import SegmentMode from "metabase/modes/components/modes/SegmentMode";

import { ORDERS } from "__support__/sample_database_fixture";

describe("modes", () => {
  describe("getQueryMode", () => {
    it("should be in segment mode when selecting one PK ID", () => {
      const filter = ["=", ["field", ORDERS.ID.id, null], 42];
      const query = ORDERS.query().filter(filter);
      const question = ORDERS.question().setQuery(query);
      expect(getQueryMode(question)).toBe(SegmentMode);
    });
    it("should be in segment mode when selecting multiple PK IDs", () => {
      const filter = ["=", ["field", ORDERS.ID.id, null], 42, 24];
      const query = ORDERS.query().filter(filter);
      const question = ORDERS.question().setQuery(query);
      expect(getQueryMode(question)).toBe(SegmentMode);
    });
  });
});
