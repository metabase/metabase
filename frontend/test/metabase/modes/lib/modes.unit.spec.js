import { getMode } from "metabase/modes/lib/modes";
import ObjectMode from "metabase/modes/components/modes/ObjectMode";
import SegmentMode from "metabase/modes/components/modes/SegmentMode";

import { ORDERS } from "__support__/sample_dataset_fixture";

describe("modes", () => {
  describe("getMode", () => {
    it("should be in object mode when selecting one PK ID", () => {
      const filter = ["=", ["field-id", ORDERS.ID.id], 42];
      const query = ORDERS.query().filter(filter);
      const question = ORDERS.question().setQuery(query);
      expect(getMode(question)).toBe(ObjectMode);
    });
    it("should be in segment mode when selecting multiple PK IDs", () => {
      const filter = ["=", ["field-id", ORDERS.ID.id], 42, 24];
      const query = ORDERS.query().filter(filter);
      const question = ORDERS.question().setQuery(query);
      expect(getMode(question)).toBe(SegmentMode);
    });
  });
});
