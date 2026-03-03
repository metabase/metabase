import {
  getSemanticTypeIcon,
  getSemanticTypeName,
} from "metabase/lib/schema_metadata";
import { TYPE } from "metabase-lib/v1/types/constants";

describe("schema_metadata", () => {
  describe("getSemanticTypeIcon", () => {
    it("should return an icon associated with the given semantic type", () => {
      expect(getSemanticTypeIcon(TYPE.PK)).toEqual("label");
      expect(getSemanticTypeIcon(TYPE.Category)).toEqual("string");
      expect(getSemanticTypeIcon(TYPE.Price)).toEqual("int");
    });

    it("should return undefined if the semantic type does not exist", () => {
      expect(getSemanticTypeIcon(TYPE.Boolean)).toBeUndefined();
      expect(getSemanticTypeIcon("foo")).toBeUndefined();
    });

    it("should accept fallback argument for unknown types", () => {
      expect(getSemanticTypeIcon("foo", "ellipsis")).toBe("ellipsis");
    });
  });

  describe("getSemanticTypeName", () => {
    it("should return an name/label associated with the given semantic type", () => {
      expect(getSemanticTypeName(TYPE.PK)).toEqual("Entity Key");
      expect(getSemanticTypeName(TYPE.Category)).toEqual("Category");
      expect(getSemanticTypeName(TYPE.Price)).toEqual("Price");
    });

    it("should return undefined if the semantic type does not exist", () => {
      expect(getSemanticTypeName(TYPE.Boolean)).toBeUndefined();
      expect(getSemanticTypeName("foo")).toBeUndefined();
    });
  });
});
