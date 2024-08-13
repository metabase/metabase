import { createMockDatabase } from "metabase-types/api/mocks";

import { isAuditDb } from "./utils";

describe("enterprise audit utils", () => {
  describe("isAuditDb", () => {
    it("should return true if the database is an audit database", () => {
      const db = createMockDatabase({ is_audit: true });
      expect(isAuditDb(db)).toBe(true);
    });

    it("should return false if the database is not an audit database", () => {
      const db = createMockDatabase({ is_audit: false });
      expect(isAuditDb(db)).toBe(false);
    });

    it("should return false if the database does not have an is_audit property", () => {
      const db = createMockDatabase({ is_audit: undefined });
      expect(isAuditDb(db)).toBe(false);
    });
  });
});
