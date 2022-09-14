import { getUniqueFieldId } from "./utils";

describe("metabase-lib/metadata/utils", () => {
  describe("getUniqueFieldId", () => {
    describe("when the given tableId arg is NOT a virtual card table", () => {
      it("should return the field's id", () => {
        expect(getUniqueFieldId(1, 2)).toEqual(1);
        // @ts-expect-error -- testing for when our types fail
        expect(getUniqueFieldId(1, undefined)).toEqual(1);
      });
    });

    describe("when the given tableId arg is a virtual card table", () => {
      it("should return a string from the combined ids", () => {
        expect(getUniqueFieldId(1, "card__123")).toEqual("card__123:1");
      });
    });
  });
});
