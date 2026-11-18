import type { FieldReference } from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";

import { getUniqueFieldId } from "./fields";

const DB_TABLE_ID = 1;

const DB_FIELD_ID = 1;
const NESTED_DB_FIELD_ID: FieldReference = ["field", 3, null];
const DB_FIELD = createMockField({
  id: DB_FIELD_ID,
  table_id: DB_TABLE_ID,
  name: "foo",
  display_name: "foo",
});

describe("metabase-lib/v1/metadata/utils", () => {
  describe("getUniqueFieldId", () => {
    describe("when the given field is from a concrete table", () => {
      it("should return the field's id", () => {
        expect(getUniqueFieldId(DB_FIELD)).toEqual(DB_FIELD_ID);
      });
    });

    describe("when the given field has a field ref id", () => {
      it("should return the field ref id", () => {
        expect(getUniqueFieldId({ id: NESTED_DB_FIELD_ID })).toBe(
          NESTED_DB_FIELD_ID[1],
        );
      });
    });
  });
});
