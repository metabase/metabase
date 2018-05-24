import {
  getFieldType,
  DATE_TIME,
  STRING,
  STRING_LIKE,
  NUMBER,
  BOOLEAN,
  LOCATION,
  COORDINATE,
  foreignKeyCountsByOriginTable,
} from "metabase/lib/schema_metadata";

import { TYPE } from "metabase/lib/types";

describe("schema_metadata", () => {
  describe("getFieldType", () => {
    it("should know a date", () => {
      expect(getFieldType({ base_type: TYPE.Date })).toEqual(DATE_TIME);
      expect(getFieldType({ base_type: TYPE.DateTime })).toEqual(DATE_TIME);
      expect(getFieldType({ base_type: TYPE.Time })).toEqual(DATE_TIME);
      expect(getFieldType({ special_type: TYPE.UNIXTimestampSeconds })).toEqual(
        DATE_TIME,
      );
      expect(
        getFieldType({ special_type: TYPE.UNIXTimestampMilliseconds }),
      ).toEqual(DATE_TIME);
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
        getFieldType({ base_type: TYPE.Text, special_type: TYPE.Name }),
      ).toEqual(STRING);
      expect(
        getFieldType({ base_type: TYPE.Text, special_type: TYPE.Description }),
      ).toEqual(STRING);
      expect(
        getFieldType({ base_type: TYPE.Text, special_type: TYPE.UUID }),
      ).toEqual(STRING);
      expect(
        getFieldType({ base_type: TYPE.Text, special_type: TYPE.URL }),
      ).toEqual(STRING);
    });
    it("should know a bool", () => {
      expect(getFieldType({ base_type: TYPE.Boolean })).toEqual(BOOLEAN);
    });
    it("should know a location", () => {
      expect(getFieldType({ special_type: TYPE.City })).toEqual(LOCATION);
      expect(getFieldType({ special_type: TYPE.Country })).toEqual(LOCATION);
    });
    it("should know a coordinate", () => {
      expect(getFieldType({ special_type: TYPE.Latitude })).toEqual(COORDINATE);
      expect(getFieldType({ special_type: TYPE.Longitude })).toEqual(
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
});
