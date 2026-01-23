import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { Database, Field, Table } from "metabase-types/api";
import {
  createMockField,
  createMockFieldDimension,
  createMockTable,
} from "metabase-types/api/mocks";

import FieldClass from "./Field";

const FIELD_ID = 1;

interface SetupOpts {
  databases?: Database[];
  tables?: Table[];
  fields?: Field[];
}

const setup = ({ databases = [], tables = [], fields = [] }: SetupOpts) => {
  const metadata = createMockMetadata({
    databases,
    tables,
    fields,
  });

  const instance = metadata.field(FIELD_ID);
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
            parent_id: 3,
          }),
          createMockField({
            id: 3,
          }),
        ],
      });

      const metadata = field.metadata;
      expect(field.path()).toEqual([
        metadata?.field(3),
        metadata?.field(2),
        metadata?.field(1),
      ]);
    });
  });

  describe("displayName", () => {
    it("should return a field's name", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            name: "foo",
            display_name: "",
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
            display_name: "field",
          }),
          createMockField({
            id: 2,
            parent_id: 3,
            display_name: "parentField",
          }),
          createMockField({
            id: 3,
            display_name: "rootField",
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
              display_name: "field",
            }),
          ],
        });

        expect(field.displayName({ includeTable: true })).toBe("field");
      });

      it("should add the table name to the start of the field name", () => {
        const field = setup({
          tables: [
            createMockTable({
              display_name: "table",
              fields: [
                createMockField({
                  id: FIELD_ID,
                  display_name: "field",
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
              display_name: "field",
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
              display_name: "table",
              schema: "schema",
              fields: [
                createMockField({
                  id: FIELD_ID,
                  display_name: "field",
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
            display_name: "field id",
          }),
        ],
      });

      expect(field.targetObjectName()).toBe("field");
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
                human_readable_field_id: 2,
              }),
            ],
          }),
          createMockField({
            id: 2,
          }),
        ],
      });

      expect(field.remappedExternalField()).toBeDefined();
      expect(field.remappedExternalField()).toBe(field.metadata?.field(2));
    });

    it("should return the name_field of a PK", () => {
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

      expect(field.remappedExternalField()).toBeDefined();
      expect(field.remappedExternalField()).toBe(field.metadata?.field(2));
    });

    it("should return the name_field of the target PK for a FK", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            semantic_type: "type/FK",
            fk_target_field_id: 2,
            target: createMockField({
              id: 2,
              semantic_type: "type/PK",
              name_field: createMockField({
                id: 3,
                semantic_type: "type/Name",
              }),
            }),
          }),
        ],
      });

      expect(field.remappedExternalField()).toBeDefined();
      expect(field.remappedExternalField()).toBe(field.metadata?.field(3));
    });

    it("should return null when the field has no name_field or no dimension with a 'human readable' field", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
          }),
        ],
      });

      expect(field.remappedExternalField()).toBe(null);
    });

    it("should return the remapped field for multiple fields if it is identical", () => {
      const metadata = createMockMetadata({
        fields: [
          createMockField({
            id: 1,
            semantic_type: "type/PK",
          }),
          createMockField({
            id: 2,
            semantic_type: "type/FK",
            dimensions: [
              createMockFieldDimension({
                type: "external",
                human_readable_field_id: 1,
              }),
            ],
          }),
          createMockField({
            id: 3,
            semantic_type: "type/FK",
            dimensions: [
              createMockFieldDimension({
                type: "external",
                human_readable_field_id: 1,
              }),
            ],
          }),
        ],
      });
      const pkField = checkNotNull(metadata.field(1));
      const fkField1 = checkNotNull(metadata.field(2));
      const fkField2 = checkNotNull(metadata.field(3));
      expect(FieldClass.remappedField([fkField1])).toBe(pkField);
      expect(FieldClass.remappedField([fkField2])).toBe(pkField);
      expect(FieldClass.remappedField([fkField1, fkField2])).toBe(pkField);
      expect(FieldClass.remappedField([pkField, fkField1])).toBeNull();
    });
  });

  describe("remappedValue", () => {
    it("should call a given value using the instance's remapping property", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            remappings: [[2, "A"]],
          }),
        ],
      });

      expect(field.remappedValue(2)).toBe("A");
    });

    it("should convert a numeric field into a number if it is not a number", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            base_type: TYPE.Number,
            semantic_type: TYPE.Number,
            remappings: [[2.5, "A"]],
          }),
        ],
      });

      expect(field.remappedValue("2.5rem")).toBe("A");
    });
  });

  describe("hasRemappedValue", () => {
    it("should call a given value using the instance's remapping property", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            remappings: [[2, "A"]],
          }),
        ],
      });

      expect(field.hasRemappedValue(1)).toBeFalsy();
      expect(field.hasRemappedValue(2)).toBeTruthy();
    });

    it("should not convert a numeric field into a number if it is not a number", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            remappings: [[2.5, "A"]],
          }),
        ],
      });

      expect(field.remappedValue("2.5rem")).toBeFalsy();
    });
  });

  describe("isSearchable", () => {
    it("should be true when the field is a string", () => {
      const field = setup({
        fields: [
          createMockField({
            id: FIELD_ID,
            base_type: TYPE.Text,
            semantic_type: TYPE.Text,
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
            semantic_type: TYPE.Number,
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

        expect(field.getUniqueId()).toBe(1);
      });
    });
  });
});
