import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

import {
  decodeSchemaViewerShareState,
  encode,
} from "./useSchemaViewerShareUrl";

describe("useSchemaViewerShareUrl", () => {
  describe("encode/decode logic", () => {
    it("should encode and decode basic state correctly", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: "PUBLIC",
        tableIds: [10, 20] as ConcreteTableId[],
        hops: 2,
      });
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded).toEqual({
        databaseId: 1,
        schema: "PUBLIC",
        tableIds: [10, 20],
        hops: 2,
      });
    });

    it("should handle undefined schema", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: undefined,
        tableIds: [10] as ConcreteTableId[],
        hops: 1,
      });
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded).toEqual({
        databaseId: 1,
        schema: undefined,
        tableIds: [10],
        hops: 1,
      });
    });

    it("should handle empty schema string as undefined", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: "",
        tableIds: [10] as ConcreteTableId[],
        hops: 1,
      });
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded?.schema).toBeUndefined();
    });

    it("should handle multiple table IDs", () => {
      const encoded = encode({
        databaseId: 5 as DatabaseId,
        schema: "ANALYTICS",
        tableIds: [1, 2, 3, 4, 5] as ConcreteTableId[],
        hops: 3,
      });
      const decoded = decodeSchemaViewerShareState(encoded);

      expect(decoded?.tableIds).toEqual([1, 2, 3, 4, 5]);
    });

    it("should handle hops value of 0", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: "PUBLIC",
        tableIds: [10] as ConcreteTableId[],
        hops: 0,
      });
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
      const encoded = encode({
        databaseId: "not-a-number" as unknown as DatabaseId,
        schema: "PUBLIC",
        tableIds: [1] as ConcreteTableId[],
        hops: 2,
      });
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toBeNull();
    });

    it("should return null when tableIds is not an array", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: "PUBLIC",
        tableIds: "not-an-array" as unknown as ConcreteTableId[],
        hops: 2,
      });
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toBeNull();
    });

    it("should return null when hops is not a number", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: "PUBLIC",
        tableIds: [1] as ConcreteTableId[],
        hops: "not-a-number" as unknown as number,
      });
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toBeNull();
    });

    it("should handle missing schema field", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: undefined,
        tableIds: [1] as ConcreteTableId[],
        hops: 2,
      });
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toEqual({
        databaseId: 1,
        schema: undefined,
        tableIds: [1],
        hops: 2,
      });
    });

    it("should handle empty schema string", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: "",
        tableIds: [1] as ConcreteTableId[],
        hops: 2,
      });
      const result = decodeSchemaViewerShareState(encoded);
      expect(result?.schema).toBeUndefined();
    });

    it("should accept valid minimal state", () => {
      const encoded = encode({
        databaseId: 1 as DatabaseId,
        schema: "PUBLIC",
        tableIds: [1] as ConcreteTableId[],
        hops: 0,
      });
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toEqual({
        databaseId: 1,
        schema: "PUBLIC",
        tableIds: [1],
        hops: 0,
      });
    });

    it("should accept valid state with multiple tables", () => {
      const encoded = encode({
        databaseId: 5 as DatabaseId,
        schema: "ANALYTICS",
        tableIds: [1, 2, 3] as ConcreteTableId[],
        hops: 3,
      });
      const result = decodeSchemaViewerShareState(encoded);
      expect(result).toEqual({
        databaseId: 5,
        schema: "ANALYTICS",
        tableIds: [1, 2, 3],
        hops: 3,
      });
    });
  });

});
