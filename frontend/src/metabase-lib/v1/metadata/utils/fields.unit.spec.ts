import { createMockMetadata } from "__support__/metadata";
import type { FieldReference } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { getUniqueFieldId } from "./fields";

const DB_TABLE_ID = 1;
const CARD_TABLE_ID = "card__1";

const DB_FIELD_ID = 1;
const CARD_FIELD_ID = 2;
const NESTED_DB_FIELD_ID: FieldReference = ["field", 3, null];
const NATIVE_CARD_FIELD_ID: FieldReference = [
  "field",
  "foo",
  { "base-type": "type/Integer" },
];

const DB_FIELD = createMockField({
  id: DB_FIELD_ID,
  table_id: DB_TABLE_ID,
  name: "foo",
  display_name: "foo",
});

const NESTED_DB_FIELD = createMockField({
  id: NESTED_DB_FIELD_ID,
});

const CARD_FIELD = createMockField({
  id: CARD_FIELD_ID,
  table_id: CARD_TABLE_ID,
  name: "foo",
  display_name: "foo",
});

const NATIVE_CARD_FIELD = createMockField({
  id: NATIVE_CARD_FIELD_ID,
  table_id: CARD_TABLE_ID,
  name: "foo",
  display_name: "foo",
});

const DB_TABLE = createMockTable({
  id: DB_TABLE_ID,
  fields: [DB_FIELD],
});

const CARD_TABLE = createMockTable({
  id: CARD_TABLE_ID,
  fields: [CARD_FIELD, NESTED_DB_FIELD, NATIVE_CARD_FIELD],
});

const setup = () => {
  return createMockMetadata({ tables: [DB_TABLE, CARD_TABLE] });
};

describe("metabase-lib/v1/metadata/utils", () => {
  describe("getUniqueFieldId", () => {
    describe("when the given field is from a concrete table", () => {
      it("should return the field's id", () => {
        const metadata = setup();
        const field = metadata.field(DB_FIELD_ID);
        expect(field && getUniqueFieldId(field)).toEqual(DB_FIELD_ID);
      });
    });

    describe("when the given field is from a structured virtual card table", () => {
      it("should return a combination of the field's id and table_id", () => {
        const metadata = setup();
        const field = metadata.field(CARD_FIELD_ID, CARD_TABLE_ID);
        expect(field && getUniqueFieldId(field)).toBe("card__1:2");
      });
    });

    describe("when the given field is from a native virtual card table", () => {
      it("should return a combination of the field's name and table_id", () => {
        const metadata = setup();
        const field = metadata.field(NATIVE_CARD_FIELD_ID, CARD_TABLE_ID);
        expect(field && getUniqueFieldId(field)).toBe("card__1:foo");
      });
    });

    describe("when the given field has a field ref id", () => {
      it("should return the field ref id", () => {
        const metadata = setup();
        const field = metadata.field(NESTED_DB_FIELD_ID);
        expect(field && getUniqueFieldId(field)).toBe(NESTED_DB_FIELD_ID[1]);
      });
    });
  });
});
