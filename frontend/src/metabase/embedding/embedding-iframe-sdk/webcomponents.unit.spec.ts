import { parseAttributeValue } from "./webcomponents";

// Note, these tests use ` when to wrap strings passed to parseAttributeValue so we can only focus on ' vs " inside the strings

describe("parseAttributeValue should be permissive with json attributes", () => {
  describe("array attributes", () => {
    it("should parse normal json with strings wrapped in double quotes", () => {
      const value = parseAttributeValue(`["value1"]`);
      expect(value).toEqual(["value1"]);
    });

    it("should parse json5 with strings wrapped in single quotes", () => {
      const value = parseAttributeValue(`['value1']`);
      expect(value).toEqual(["value1"]);
    });

    it("should allow for a single trailing comma", () => {
      const value = parseAttributeValue(`["value1", "value2",]`);
      expect(value).toEqual(["value1", "value2"]);
    });

    it("should allow for mixed quotes", () => {
      const value = parseAttributeValue(`['value1', "value2",]`);
      expect(value).toEqual(["value1", "value2"]);
    });
  });

  describe("object attributes", () => {
    it("should parse normal json with strings wrapped in double quotes", () => {
      const value = parseAttributeValue(`{"key1": "value1"}`);
      expect(value).toEqual({ key1: "value1" });
    });

    it("should parse json5 with strings wrapped in single quotes", () => {
      const value = parseAttributeValue(`{'key1': 'value1'}`);
      expect(value).toEqual({ key1: "value1" });
    });

    it("should allow for a single trailing comma", () => {
      const value = parseAttributeValue(
        `{"key1": "value1", "key2": "value2",}`,
      );
      expect(value).toEqual({ key1: "value1", key2: "value2" });
    });

    it("should allowed for mixed quotes", () => {
      const value = parseAttributeValue(
        `{"key1": 'value1', "key2": "value2",}`,
      );
      expect(value).toEqual({ key1: "value1", key2: "value2" });
    });
  });
});
