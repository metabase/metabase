import { getFieldType } from "metabase-lib/types/utils/isa";
import {
  TYPE,
  TEMPORAL,
  STRING,
  STRING_LIKE,
  NUMBER,
  BOOLEAN,
  LOCATION,
  COORDINATE,
  PRIMARY_KEY,
} from "metabase-lib/types/constants";

describe("isa", () => {
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

    describe("should know something that is string-like", () => {
      it("TYPE.TextLike", () => {
        expect(getFieldType({ base_type: TYPE.TextLike })).toEqual(STRING_LIKE);
      });

      it("TYPE.IPAddress", () => {
        expect(getFieldType({ base_type: TYPE.IPAddress })).toEqual(
          STRING_LIKE,
        );
      });
    });

    it("should still recognize some types as a string regardless of its base type", () => {
      // TYPE.Float can occur in a field filter
      expect(
        getFieldType({ base_type: TYPE.Float, semantic_type: TYPE.Name }),
      ).toEqual(STRING);
      expect(
        getFieldType({ base_type: TYPE.Float, semantic_type: TYPE.Category }),
      ).toEqual(STRING);
    });

    it("should know a bool regardless of semantic_type", () => {
      expect(
        getFieldType({
          base_type: TYPE.Boolean,
          semantic_type: TYPE.Category,
        }),
      ).toEqual(BOOLEAN);
    });

    it("should know what it doesn't know", () => {
      expect(getFieldType({ base_type: "DERP DERP DERP" })).toEqual(undefined);
    });
  });
});
