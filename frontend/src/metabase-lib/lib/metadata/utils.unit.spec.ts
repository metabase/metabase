import { getUniqueFieldId } from "./utils";
import { createMockConcreteField, createMockVirtualField } from "./mocks";

const structuredVirtualCardField = createMockConcreteField({
  apiOpts: {
    id: 1,
    table_id: "card__123",
    name: "foo",
  },
});

const nativeVirtualCardField = createMockConcreteField({
  apiOpts: {
    id: undefined,
    table_id: "card__123",
    name: "foo",
  },
});

const concreteTableField = createMockConcreteField({
  apiOpts: {
    id: 1,
    table_id: 123,
    name: "foo",
  },
});

const fieldWithFieldRefId = createMockVirtualField({
  constructorOpts: {
    id: ["field", 1, null],
    table_id: 123,
  },
});

describe("metabase-lib/metadata/utils", () => {
  describe("getUniqueFieldId", () => {
    describe("when the given field is from a concrete table", () => {
      it("should return the field's id", () => {
        expect(getUniqueFieldId(concreteTableField)).toEqual(1);
      });
    });

    describe("when the given field is from a structured virtual card table", () => {
      it("should return a combination of the field's id and table_id", () => {
        expect(getUniqueFieldId(structuredVirtualCardField)).toBe(
          "card__123:1",
        );
      });
    });

    describe("when the given field is from a native virtual card table", () => {
      it("should return a combination of the field's name and table_id", () => {
        expect(getUniqueFieldId(nativeVirtualCardField)).toBe("card__123:foo");
      });
    });

    describe("when the given field has a field ref id", () => {
      it("should return the field ref id", () => {
        expect(getUniqueFieldId(fieldWithFieldRefId)).toBe(1);
      });
    });
  });
});
