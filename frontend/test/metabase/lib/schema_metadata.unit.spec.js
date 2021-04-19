import {
  getFieldType,
  TEMPORAL,
  STRING,
  STRING_LIKE,
  NUMBER,
  BOOLEAN,
  LOCATION,
  COORDINATE,
  PRIMARY_KEY,
  foreignKeyCountsByOriginTable,
  isEqualsOperator,
  doesOperatorExist,
  getOperatorByTypeAndName,
  isFuzzyOperator,
} from "metabase/lib/schema_metadata";

import { TYPE } from "metabase/lib/types";

describe("schema_metadata", () => {
  describe("getFieldType", () => {
    it("should know a date", () => {
      expect(getFieldType({ base_type: TYPE.Date })).toEqual(TEMPORAL);
      expect(getFieldType({ base_type: TYPE.DateTime })).toEqual(TEMPORAL);
      expect(getFieldType({ base_type: TYPE.Time })).toEqual(TEMPORAL);
      expect(getFieldType({ effective_type: TYPE.Date })).toEqual(TEMPORAL);
      expect(getFieldType({ effective_type: TYPE.DateTime })).toEqual(TEMPORAL);
      expect(getFieldType({ effective_type: TYPE.Time })).toEqual(TEMPORAL);
    });
    it("should know a number", () => {
      expect(getFieldType({ base_type: TYPE.BigInteger })).toEqual(NUMBER);
      expect(getFieldType({ base_type: TYPE.Integer })).toEqual(NUMBER);
      expect(getFieldType({ base_type: TYPE.Float })).toEqual(NUMBER);
      expect(getFieldType({ base_type: TYPE.Decimal })).toEqual(NUMBER);
    });
    it("should know a string", () => {
      expect(getFieldType({ base_type: TYPE.Text })).toEqual(STRING);
    });
    it("should know things that are types of strings", () => {
      expect(
        getFieldType({ base_type: TYPE.Text, semantic_type: TYPE.Name }),
      ).toEqual(STRING);
      expect(
        getFieldType({ base_type: TYPE.Text, semantic_type: TYPE.Description }),
      ).toEqual(STRING);
      expect(
        getFieldType({ base_type: TYPE.Text, semantic_type: TYPE.UUID }),
      ).toEqual(STRING);
      expect(
        getFieldType({ base_type: TYPE.Text, semantic_type: TYPE.URL }),
      ).toEqual(STRING);
    });
    it("should know a pk", () => {
      expect(
        getFieldType({ base_type: TYPE.Integer, semantic_type: TYPE.PK }),
      ).toEqual(PRIMARY_KEY);
    });
    it("should know a bool", () => {
      expect(getFieldType({ base_type: TYPE.Boolean })).toEqual(BOOLEAN);
    });
    it("should know a location", () => {
      expect(getFieldType({ semantic_type: TYPE.City })).toEqual(LOCATION);
      expect(getFieldType({ semantic_type: TYPE.Country })).toEqual(LOCATION);
    });
    it("should know a coordinate", () => {
      expect(getFieldType({ semantic_type: TYPE.Latitude })).toEqual(
        COORDINATE,
      );
      expect(getFieldType({ semantic_type: TYPE.Longitude })).toEqual(
        COORDINATE,
      );
    });
    it("should know something that is string-like", () => {
      expect(getFieldType({ base_type: TYPE.TextLike })).toEqual(STRING_LIKE);
      expect(getFieldType({ base_type: TYPE.IPAddress })).toEqual(STRING_LIKE);
    });
    it("should know what it doesn't know", () => {
      expect(getFieldType({ base_type: "DERP DERP DERP" })).toEqual(undefined);
    });
  });

  describe("foreignKeyCountsByOriginTable", () => {
    it("should work with null input", () => {
      expect(foreignKeyCountsByOriginTable(null)).toEqual(null);
    });
    it("should require an array as input", () => {
      expect(foreignKeyCountsByOriginTable({})).toEqual(null);
    });
    it("should count occurrences by origin.table.id", () => {
      expect(
        foreignKeyCountsByOriginTable([
          { origin: { table: { id: 123 } } },
          { origin: { table: { id: 123 } } },
          { origin: { table: { id: 123 } } },
          { origin: { table: { id: 456 } } },
        ]),
      ).toEqual({ 123: 3, 456: 1 });
    });
  });

  describe("doesOperatorExist", () => {
    it("should return a boolean indicating existence of operator with given name", () => {
      expect(doesOperatorExist("foo")).toBe(false);
      expect(doesOperatorExist("contains")).toBe(true);
      expect(doesOperatorExist("between")).toBe(true);
    });
  });

  describe("isEqualsOperator", () => {
    it("given operator metadata object", () => {
      it("should evaluate whether it is an equals operator", () => {
        expect(isEqualsOperator()).toBe(false);
        expect(isEqualsOperator({ name: "foo" })).toBe(false);
        expect(isEqualsOperator({ name: "=" })).toBe(true);
      });
    });
  });

  describe("getOperatorByTypeAndName", () => {
    it("should return undefined if operator does not exist", () => {
      expect(getOperatorByTypeAndName("FOO", "=")).toBe(undefined);
      expect(getOperatorByTypeAndName(NUMBER, "contains")).toBe(undefined);
    });

    it("should return a metadata object for specific operator type/name", () => {
      expect(getOperatorByTypeAndName(NUMBER, "between")).toEqual({
        name: "between",
        numFields: 2,
        validArgumentsFilters: [expect.any(Function), expect.any(Function)],
        verboseName: "Between",
      });
    });
  });

  describe("isFuzzyOperator", () => {
    it("should return false for operators that expect an exact match", () => {
      expect(isFuzzyOperator({ name: "=" })).toBe(false);
      expect(isFuzzyOperator({ name: "!=" })).toBe(false);
    });

    it("should return true for operators that are not exact", () => {
      expect(isFuzzyOperator({ name: "contains" })).toBe(true);
      expect(isFuzzyOperator({ name: "between" })).toBe(true);
    });
  });
});
