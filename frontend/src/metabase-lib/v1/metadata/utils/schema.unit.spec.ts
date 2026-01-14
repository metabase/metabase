import { generateSchemaId, getSchemaName, parseSchemaId } from "./schema";

describe("schema utils", () => {
  describe("generateSchemaId", () => {
    it("should generate a schema ID with database ID and schema name", () => {
      expect(generateSchemaId(1, "public")).toBe("1:public");
    });

    it("should URL-encode schema names with special characters", () => {
      expect(generateSchemaId(1, "my:database")).toBe("1:my%3Adatabase");
    });

    it("should handle schema names with multiple colons", () => {
      expect(generateSchemaId(1, "my:special:schema")).toBe(
        "1:my%3Aspecial%3Aschema",
      );
    });

    it("should handle empty schema name", () => {
      expect(generateSchemaId(1, "")).toBe("1:");
    });

    it("should handle null schema name", () => {
      expect(generateSchemaId(1, null)).toBe("1:");
    });

    it("should handle undefined schema name", () => {
      expect(generateSchemaId(1, undefined)).toBe("1:");
    });
  });

  describe("parseSchemaId", () => {
    it("should parse a simple schema ID", () => {
      expect(parseSchemaId("1:public")).toEqual([1, "public"]);
    });

    it("should parse schema ID with URL-encoded colon", () => {
      expect(parseSchemaId("1:my%3Adatabase")).toEqual([1, "my:database"]);
    });

    it("should parse schema ID with multiple URL-encoded colons", () => {
      expect(parseSchemaId("1:my%3Aspecial%3Aschema")).toEqual([
        1,
        "my:special:schema",
      ]);
    });

    it("should handle empty schema name", () => {
      expect(parseSchemaId("1:")).toEqual([1, ""]);
    });

    it("should handle null input", () => {
      expect(parseSchemaId(null)).toEqual([NaN, ""]);
    });

    it("should handle undefined input", () => {
      expect(parseSchemaId(undefined)).toEqual([NaN, ""]);
    });
  });

  describe("getSchemaName", () => {
    it("should extract schema name from schema ID", () => {
      expect(getSchemaName("1:public")).toBe("public");
    });

    it("should extract schema name with colon from encoded schema ID", () => {
      expect(getSchemaName("1:my%3Adatabase")).toBe("my:database");
    });
  });

  describe("round-trip encoding", () => {
    it("should correctly round-trip encode and decode schema with colon", () => {
      const schemaId = generateSchemaId(17, "my:database");
      const [dbId, schemaName] = parseSchemaId(schemaId);
      expect(dbId).toBe(17);
      expect(schemaName).toBe("my:database");
    });

    it("should correctly round-trip encode and decode schema with multiple colons", () => {
      const schemaId = generateSchemaId(17, "my:special:database");
      const [dbId, schemaName] = parseSchemaId(schemaId);
      expect(dbId).toBe(17);
      expect(schemaName).toBe("my:special:database");
    });
  });
});
