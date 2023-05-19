import { Database, Field, FieldId, Table } from "metabase-types/api";
import {
  createMockDateTimeFieldFingerprint,
  createMockField,
  createMockFieldDimension,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";
import { TYPE } from "metabase-lib/types/constants";

const FIELD_ID = 1;

interface SetupOpts {
  fieldId?: FieldId;
  databases?: Database[];
  tables?: Table[];
  fields?: Field[];
}

const setup = ({
  fieldId = FIELD_ID,
  databases = [],
  tables = [],
  fields = [],
}: SetupOpts) => {
  const metadata = createMockMetadata({
    databases,
    tables,
    fields,
  });

  const instance = metadata.field(fieldId);
  if (!instance) {
    throw TypeError();
  }

  return instance;
};

describe("Field", () => {
  describe("instantiation", () => {
    it("should create an instance of Schema", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
          }),
        ],
      });

      expect(field).toBeDefined();
    });
  });

  describe("parent", () => {
    it("should return null when `metadata` does not exist on instance", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
          }),
        ],
      });

      expect(field.parent()).toBeNull();
    });

    it("should return the field that matches the instance's `parent_id` when `metadata` exists on the instance", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            parent_id: 2,
          }),
          createMockField({
            id: 2,
          }),
        ],
      });

      expect(field.parent()).toBeDefined();
      expect(field.parent()).toBe(field.metadata?.field(2));
    });
  });

  describe("path", () => {
    it("should return list of fields starting with instance, ending with root parent", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            parent_id: 2,
          }),
          createMockField({
            id: 2,
          }),
          createMockField({
            id: 3,
          }),
        ],
      });

      const metadata = field.metadata;
      expect(field.path()).toEqual([
        metadata?.field(1),
        metadata?.field(2),
        metadata?.field(3),
      ]);
    });
  });

  describe("displayName", () => {
    it("should return a field's display name", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            name: "foo",
          }),
        ],
      });

      expect(field.displayName()).toBe("foo");
    });

    it("should prioritize the `display_name` field over `name`", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            name: "foo",
            display_name: "bar",
          }),
        ],
      });

      expect(field.displayName()).toBe("bar");
    });

    it("should prioritize the name in the field's `dimensions` property if it has one", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            display_name: "display",
            dimensions: [
              createMockFieldDimension({
                name: "dimensions",
              }),
            ],
          }),
        ],
      });

      expect(field.displayName()).toBe("dimensions");
    });

    describe("includePath flag", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            parent_id: 2,
          }),
          createMockField({
            id: 2,
            name: "parentField",
          }),
          createMockField({
            id: 3,
            name: "rootField",
          }),
        ],
      });

      it("should add parent field display names to the field's display name when enabled", () => {
        expect(field.displayName({ includePath: true })).toBe(
          "rootField: parentField: field",
        );
      });

      it("should be enabled by default", () => {
        expect(
          field.displayName({
            includePath: true,
          }),
        ).toBe(field.displayName());
      });

      it("should exclude parent field display names when disabled", () => {
        expect(field.displayName({ includePath: false })).toBe("field");
      });
    });

    describe("includeTable flag", () => {
      it("should do nothing when there is no table on the field instance", () => {
        const field = setup({
          fields: [
            createMockField({
              id: FIELD_ID,
              name: "field",
            }),
          ],
        });

        expect(field.displayName({ includeTable: true })).toBe("field");
      });

      it("should add the table name to the start of the field name", () => {
        const field = setup({
          tables: [
            createMockTable({
              name: "table",
              fields: [
                createMockField({
                  id: FIELD_ID,
                  name: "field",
                }),
              ],
            }),
          ],
        });

        expect(field.displayName({ includeTable: true })).toBe("table → field");
      });
    });

    describe("includeSchema flag", () => {
      it("won't do anything if enabled and includeTable is not enabled", () => {
        const field = setup({
          fields: [
            createMockField({
              id: FIELD_ID,
              name: "field",
            }),
          ],
        });

        expect(
          field.displayName({
            includeSchema: true,
          }),
        ).toBe("field");
      });

      it("should add a combined schema + table display name to the start of the field name", () => {
        const field = setup({
          tables: [
            createMockTable({
              name: "table",
              schema: "schema",
              fields: [
                createMockField({
                  id: FIELD_ID,
                  name: "field",
                }),
              ],
            }),
          ],
        });

        expect(
          field.displayName({
            includeTable: true,
            includeSchema: true,
          }),
        ).toBe("Schema.table → field");
      });
    });
  });

  describe("targetObjectName", () => {
    it("should return the display name of the field stripped of an appended id", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            name: "field id",
          }),
        ],
      });

      expect(field.targetObjectName()).toBe("field");
    });
  });

  describe("dimension", () => {
    it("should return the field's dimension when the id is an mbql field", () => {
      const field = setup({
        fields: [
          createMockField({
            id: ["field", 123, null],
            name: "field id",
          }),
        ],
      });

      const dimension = field.dimension();
      expect(dimension.fieldIdOrName()).toBe(123);
    });

    it("should return the field's dimension when the id is not an mbql field", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            name: "field id",
          }),
        ],
      });

      const dimension = field.dimension();
      expect(dimension.fieldIdOrName()).toBe(123);
    });
  });

  describe("getDefaultDateTimeUnit", () => {
    describe("when the field is of type `type/DateTime`", () => {
      it("should return 'day'", () => {
        const field = setup({
          fields: [
            createMockField({
              id: FIELD_ID,
            }),
          ],
        });

        expect(field.getDefaultDateTimeUnit()).toBe("day");
      });
    });
  });

  describe("when field is of type `type/DateTime`", () => {
    it("should return a time unit depending on the number of days in the 'fingerprint'", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            fingerprint: {
              type: {
                "type/DateTime": createMockDateTimeFieldFingerprint({
                  earliest: "2019-03-01T00:00:00Z",
                  latest: "2021-01-01T00:00:00Z",
                }),
              },
            },
          }),
        ],
      });

      expect(field.getDefaultDateTimeUnit()).toBe("month");
    });
  });

  describe("remappedField", () => {
    it("should return the 'human readable' field tied to the field's dimension", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            dimensions: [
              createMockFieldDimension({
                human_readable_field_id: 3,
              }),
            ],
          }),
          createMockField({
            id: 2,
          }),
        ],
      });

      expect(field.remappedField()).toBeDefined();
      expect(field.remappedField()).toBe(field.metadata?.field(2));
    });

    it("should return the field's name_field", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            name_field: createMockField({
              id: 2,
            }),
          }),
        ],
      });

      expect(field.remappedField()).toBeDefined();
      expect(field.remappedField()).toBe(field.metadata?.field(2));
    });

    it("should return null when the field has no name_field or no dimension with a 'human readable' field", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
          }),
        ],
      });

      expect(field.remappedField()).toBe(null);
    });
  });

  describe("remappedValue", () => {
    it("should call a given value using the instance's remapping property", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            remappings: [[2, "1"]],
          }),
        ],
      });

      expect(field.remappedValue(2)).toBe("1");
    });

    it("should convert a numeric field into a number if it is not a number", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            base_type: TYPE.Number,
            remappings: [[2.5, "2.5"]],
          }),
        ],
      });

      expect(field.remappedValue("2.5rem")).toBe(2.5);
    });
  });

  describe("hasRemappedValue", () => {
    it("should call a given value using the instance's remapping property", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            remappings: [[2, "1"]],
          }),
        ],
      });

      expect(field.hasRemappedValue(1)).toBe(false);
      expect(field.hasRemappedValue(2)).toBe(true);
    });

    it("should not convert a numeric field into a number if it is not a number", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            remappings: [[2.5, "2.5"]],
          }),
        ],
      });

      expect(field.remappedValue("2.5rem")).toBe(null);
    });
  });

  describe("isSearchable", () => {
    it("should be true when the field is a string", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            base_type: TYPE.String,
          }),
        ],
      });

      expect(field.isSearchable()).toBe(true);
    });

    it("should be false when the field is not a string", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            base_type: TYPE.Number,
          }),
        ],
      });

      expect(field.isSearchable()).toBe(false);
    });
  });

  describe("fieldValues", () => {
    it("should return the values on a field instance", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            values: [[1], [2]],
          }),
        ],
      });

      expect(field.fieldValues()).toEqual([[1], [2]]);
    });

    it("should wrap raw values in arrays to match the format of remapped values", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            values: [[1], [2]],
          }),
        ],
      });

      expect(field.fieldValues()).toEqual([[1], [2]]);
    });
  });

  describe("hasFieldValues", () => {
    it("should be true when a field has values", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            values: [[1], [2]],
          }),
        ],
      });

      expect(field.hasFieldValues()).toBe(true);
    });

    it("should be false when a field has empty values", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            values: [],
          }),
        ],
      });

      expect(field.hasFieldValues()).toBe(false);
    });

    it("should be false when a field has no values", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            values: [[1], [2]],
          }),
        ],
      });

      expect(field.hasFieldValues()).toBe(false);
    });
  });

  describe("getUniqueId", () => {
    describe("when the `uniqueId` field exists on the instance", () => {
      it("should return the `uniqueId`", () => {
        const field = setup({
          fields: [
            createMockField({
              id: FIELD_ID,
            }),
          ],
        });

        expect(field.getUniqueId()).toBe("1");
      });
    });

    describe("when the `uniqueId` field does not exist on the instance of a concrete Field", () => {
      const field = setup({
        fields: [
          createMockField({
            id: ["field", 1, null],
          }),
        ],
      });

      it("should create a `uniqueId`", () => {
        expect(field.getUniqueId()).toBe(1);
      });
    });

    describe("when the `uniqueId` field does not exist on the instance of a Field from a virtual card Table", () => {
      const field = setup({
        fields: [
          createMockField({
            id: ["field", 1, null],
            table_id: "card__2",
          }),
        ],
      });

      it("should create a `uniqueId`", () => {
        expect(field.getUniqueId()).toBe("card__2:1");
      });
    });
  });
});
