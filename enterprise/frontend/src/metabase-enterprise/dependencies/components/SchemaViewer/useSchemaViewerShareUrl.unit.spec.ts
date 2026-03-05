import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

import { decodeSchemaViewerShareState } from "./useSchemaViewerShareUrl";

describe("useSchemaViewerShareUrl", () => {
  describe("encode/decode logic", () => {
    it("should encode and decode basic state correctly", () => {
      const state = {
        d: 1,
        s: "PUBLIC",
        t: [10, 20],
        h: 2,
      };
      const encoded = btoa(JSON.stringify(state));
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded).toEqual({
        databaseId: 1,
        schema: "PUBLIC",
        tableIds: [10, 20],
        hops: 2,
      });
    });

    it("should handle undefined schema", () => {
      const state = {
        d: 1,
        s: "",
        t: [10],
        h: 1,
      };
      const encoded = btoa(JSON.stringify(state));
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded).toEqual({
        databaseId: 1,
        schema: undefined,
        tableIds: [10],
        hops: 1,
      });
    });

    it("should handle empty schema string as undefined", () => {
      const state = {
        d: 1,
        s: "",
        t: [10],
        h: 1,
      };
      const encoded = btoa(JSON.stringify(state));
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded?.schema).toBeUndefined();
    });

    it("should handle multiple table IDs", () => {
      const state = {
        d: 5,
        s: "ANALYTICS",
        t: [1, 2, 3, 4, 5],
        h: 3,
      };
      const encoded = btoa(JSON.stringify(state));
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded?.tableIds).toEqual([1, 2, 3, 4, 5]);
    });

    it("should handle hops value of 0", () => {
      const state = {
        d: 1,
        s: "PUBLIC",
        t: [10],
        h: 0,
      };
      const encoded = btoa(JSON.stringify(state));
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded?.hops).toBe(0);
    });
  });

  describe("decodeSchemaViewerShareState validation", () => {
    it("should return null for invalid base64", () => {
      const result = decodeSchemaViewerShareState("not-valid-base64!!!!");
      expect(result).toBeNull();
    });

    it("should return null for non-JSON base64", () => {
      const encoded = btoa("not json");
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toBeNull();
    });

    it("should return null when databaseId is not a number", () => {
      const invalid = { d: "not-a-number", s: "PUBLIC", t: [1], h: 2 };
      const encoded = btoa(JSON.stringify(invalid));
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toBeNull();
    });

    it("should return null when tableIds is not an array", () => {
      const invalid = { d: 1, s: "PUBLIC", t: "not-an-array", h: 2 };
      const encoded = btoa(JSON.stringify(invalid));
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toBeNull();
    });

    it("should return null when hops is not a number", () => {
      const invalid = { d: 1, s: "PUBLIC", t: [1], h: "not-a-number" };
      const encoded = btoa(JSON.stringify(invalid));
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toBeNull();
    });

    it("should handle missing schema field", () => {
      const valid = { d: 1, t: [1], h: 2 };
      const encoded = btoa(JSON.stringify(valid));
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toEqual({
        databaseId: 1,
        schema: undefined,
        tableIds: [1],
        hops: 2,
      });
    });

    it("should handle empty schema string", () => {
      const valid = { d: 1, s: "", t: [1], h: 2 };
      const encoded = btoa(JSON.stringify(valid));
      const result = decodeSchemaViewerShareState(encoded);
      expect(result?.schema).toBeUndefined();
    });

    it("should accept valid minimal state", () => {
      const valid = { d: 1, s: "PUBLIC", t: [1], h: 0 };
      const encoded = btoa(JSON.stringify(valid));
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toEqual({
        databaseId: 1,
        schema: "PUBLIC",
        tableIds: [1],
        hops: 0,
      });
    });

    it("should accept valid state with multiple tables", () => {
      const valid = { d: 5, s: "ANALYTICS", t: [1, 2, 3], h: 3 };
      const encoded = btoa(JSON.stringify(valid));
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toEqual({
        databaseId: 5,
        schema: "ANALYTICS",
        tableIds: [1, 2, 3],
        hops: 3,
      });
    });
  });

  describe("URL generation conditions", () => {
    it("should not generate URL when databaseId is undefined", () => {
      const databaseId = undefined;
      const tableIds = [1 as ConcreteTableId];

      const shouldGenerateUrl = databaseId != null && tableIds != null && tableIds.length > 0;

      expect(shouldGenerateUrl).toBe(false);
    });

    it("should not generate URL when tableIds is null", () => {
      const databaseId = 1 as DatabaseId;
      const tableIds = null;

      const shouldGenerateUrl = databaseId != null && tableIds != null && tableIds.length > 0;

      expect(shouldGenerateUrl).toBe(false);
    });

    it("should not generate URL when tableIds is empty", () => {
      const databaseId = 1 as DatabaseId;
      const tableIds: ConcreteTableId[] = [];

      const shouldGenerateUrl = databaseId != null && tableIds != null && tableIds.length > 0;

      expect(shouldGenerateUrl).toBe(false);
    });

    it("should generate URL when all conditions met", () => {
      const databaseId = 1 as DatabaseId;
      const tableIds = [1 as ConcreteTableId];

      const shouldGenerateUrl = databaseId != null && tableIds != null && tableIds.length > 0;

      expect(shouldGenerateUrl).toBe(true);
    });
  });

  describe("URL structure", () => {
    it("should construct URL with origin, pathname, and share param", () => {
      const origin = "http://localhost:3000";
      const pathname = "/data-studio/schema-viewer";
      const encoded = "test-encoded-value";

      const url = `${origin}${pathname}?share=${encoded}`;

      expect(url).toContain(origin);
      expect(url).toContain(pathname);
      expect(url).toContain("?share=");
      expect(url).toContain(encoded);
    });

    it("should be parseable as URL", () => {
      const url = "http://localhost:3000/data-studio/schema-viewer?share=test";

      expect(() => new URL(url)).not.toThrow();

      const parsed = new URL(url);
      expect(parsed.searchParams.has("share")).toBe(true);
      expect(parsed.searchParams.get("share")).toBe("test");
    });
  });
});
