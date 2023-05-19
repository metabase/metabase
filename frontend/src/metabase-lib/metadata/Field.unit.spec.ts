import { Database, Field, Table } from "metabase-types/api";
import {
  createMockField,
  createMockFieldDimension,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";

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
      let field;
      beforeEach(() => {
        field = new Field({
          id: 1,
          name: "field",
        });
      });

      it("won't do anything if enabled and includeTable is not enabled", () => {
        expect(
          field.displayName({
            includeSchema: true,
          }),
        ).toBe("field");
      });

      it("should add a combined schema + table display name to the start of the field name", () => {
        field.table = new Table({
          display_name: "table",
          schema: new Schema({
            name: "schema",
          }),
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
      const field = new Field({
        name: "field id",
      });
      expect(field.targetObjectName()).toBe("field");
    });
  });

  describe("dimension", () => {
    it("should return the field's dimension when the id is an mbql field", () => {
      const field = new Field({
        id: ["field", 123, null],
      });
      const dimension = field.dimension();
      expect(dimension).toBeInstanceOf(Dimension);
      expect(dimension.fieldIdOrName()).toBe(123);
    });

    it("should return the field's dimension when the id is not an mbql field", () => {
      const field = new Field({
        id: 123,
      });
      const dimension = field.dimension();
      expect(dimension).toBeInstanceOf(Dimension);
      expect(dimension.fieldIdOrName()).toBe(123);
    });
  });

  describe("getDefaultDateTimeUnit", () => {
    describe("when the field is of type `type/DateTime`", () => {
      it("should return 'day'", () => {
        const field = new Field({
          fingerprint: {
            type: {
              "type/Number": {},
            },
          },
        });
        expect(field.getDefaultDateTimeUnit()).toBe("day");
      });
    });
  });

  describe("when field is of type `type/DateTime`", () => {
    it("should return a time unit depending on the number of days in the 'fingerprint'", () => {
      const field = new Field({
        fingerprint: {
          type: {
            "type/DateTime": {
              earliest: "2019-03-01T00:00:00Z",
              latest: "2021-01-01T00:00:00Z",
            },
          },
        },
      });
      expect(field.getDefaultDateTimeUnit()).toBe("month");
    });
  });

  describe("remappedField", () => {
    it("should return the 'human readable' field tied to the field's dimension", () => {
      const field1 = new Field({
        id: 1,
      });
      const field2 = new Field({
        id: 2,
      });
      const metadata = new Metadata({
        fields: {
          1: field1,
          2: field2,
        },
      });
      const field = new Field({
        id: 3,
        dimensions: [
          {
            human_readable_field_id: 1,
          },
        ],
      });
      field.metadata = metadata;
      expect(field.remappedField()).toBe(field1);
    });

    it("should return the field's name_field", () => {
      const nameField = new Field();
      const field = new Field({
        id: 3,
        name_field: nameField,
      });
      expect(field.remappedField()).toBe(nameField);
    });

    it("should return null when the field has no name_field or no dimension with a 'human readable' field", () => {
      expect(new Field().remappedField()).toBe(null);
    });
  });

  describe("remappedValue", () => {
    it("should call a given value using the instance's remapping property", () => {
      const field = new Field({
        remapping: {
          get: () => 1,
        },
      });
      expect(field.remappedValue(2)).toBe(1);
    });

    it("should convert a numeric field into a number if it is not a number", () => {
      const field = new Field({
        isNumeric: () => true,
        remapping: {
          get: num => num,
        },
      });
      expect(field.remappedValue("2.5rem")).toBe(2.5);
    });
  });

  describe("hasRemappedValue", () => {
    it("should call a given value using the instance's remapping property", () => {
      const field = new Field({
        remapping: {
          has: () => true,
        },
      });
      expect(field.hasRemappedValue(2)).toBe(true);
    });

    it("should convert a numeric field into a number if it is not a number", () => {
      const field = new Field({
        isNumeric: () => true,
        remapping: {
          has: num => typeof num === "number",
        },
      });
      expect(field.hasRemappedValue("2.5rem")).toBe(true);
    });
  });

  describe("isSearchable", () => {
    it("should be true when the field is a string", () => {
      const field = new Field({
        isString: () => true,
      });
      expect(field.isSearchable()).toBe(true);
    });
    it("should be false when the field is not a string", () => {
      const field = new Field({
        isString: () => false,
      });
      expect(field.isSearchable()).toBe(false);
    });
  });

  describe("fieldValues", () => {
    it("should return the values on a field instance", () => {
      const values = [[1], [2]];
      const field = new Field({
        values,
      });
      expect(field.fieldValues()).toEqual(values);
    });

    it("should wrap raw values in arrays to match the format of remapped values", () => {
      const values = [1, 2];
      const field = new Field({
        values,
      });
      expect(field.fieldValues()).toEqual([[1], [2]]);
    });
  });

  describe("hasFieldValues", () => {
    it("should be true when a field has values", () => {
      expect(
        new Field({
          values: [1],
        }).hasFieldValues(),
      ).toBe(true);
    });

    it("should be false when a field has no values", () => {
      expect(
        new Field({
          values: [],
        }).hasFieldValues(),
      ).toBe(false);
      expect(
        new Field({
          values: undefined,
        }).hasFieldValues(),
      ).toBe(false);
    });
  });

  describe("getUniqueId", () => {
    describe("when the `uniqueId` field exists on the instance", () => {
      it("should return the `uniqueId`", () => {
        const field = new Field({
          uniqueId: "foo",
        });
        expect(field.getUniqueId()).toBe("foo");
      });
    });

    describe("when the `uniqueId` field does not exist on the instance of a concrete Field", () => {
      let field;
      beforeEach(() => {
        field = createMockConcreteField({
          apiOpts: {
            id: 1,
            table_id: 2,
          },
        });
      });

      it("should create a `uniqueId`", () => {
        expect(field.getUniqueId()).toBe(1);
      });

      it("should set the `uniqueId` on the Field instance", () => {
        field.getUniqueId();
        expect(field.uniqueId).toBe(1);
      });
    });

    describe("when the `uniqueId` field does not exist on the instance of a Field from a virtual card Table", () => {
      let field;
      beforeEach(() => {
        field = createMockConcreteField({
          apiOpts: {
            id: 1,
            table_id: "card__123",
          },
        });
      });

      it("should create a `uniqueId`", () => {
        expect(field.getUniqueId()).toBe("card__123:1");
      });

      it("should set the `uniqueId` on the Field instance", () => {
        field.getUniqueId();
        expect(field.uniqueId).toBe("card__123:1");
      });
    });
  });
});
