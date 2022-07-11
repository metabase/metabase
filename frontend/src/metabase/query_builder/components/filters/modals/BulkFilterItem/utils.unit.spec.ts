import Field from "metabase-lib/lib/metadata/Field";

import { getFieldPickerType } from "./utils";

describe("getFieldPickerType", () => {
  it("text field with list field values renders a category picker", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "list",
      values: [["Michaelangelo"], ["Donatello"], ["Raphael"], ["Leonardo"]],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/Text",
      id: 137,
      base_type: "type/Text",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("category");
  });

  it("boolean field type overrides list field values", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "list",
      values: [["Michaelangelo"], ["Donatello"], ["Raphael"], ["Leonardo"]],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/Boolean",
      id: 137,
      base_type: "type/Boolean",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("boolean");
  });

  it("time field does not render a date component", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/TimeWithTZ",
      id: 137,
      base_type: "type/TimeWithTZ",
    });

    const testField2 = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/Time",
      id: 137,
      base_type: "type/Time",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("other");

    const fieldPickerType2 = getFieldPickerType(testField2);
    expect(fieldPickerType2).toBe("other");
  });

  it("date field renders a date component", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/Date",
      id: 137,
      base_type: "type/Date",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("date");
  });

  it("datetime field renders a date component", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/DateTimeWithLocalTZ",
      id: 137,
      base_type: "type/DateTimeWithLocalTZ",
    });

    const testField2 = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/DateTime",
      id: 137,
      base_type: "type/DateTime",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("date");

    const fieldPickerType2 = getFieldPickerType(testField2);
    expect(fieldPickerType2).toBe("date");
  });

  it("text field renders a value component", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/Text",
      id: 137,
      base_type: "type/Text",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("value");
  });

  it("int field renders a value component", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/Integer",
      id: 137,
      base_type: "type/Integer",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("value");
  });

  it("float field renders a value component", () => {
    const testField = new Field({
      database_type: "test",
      semantic_type: "",
      table_id: 8,
      name: "test",
      has_field_values: "none",
      values: [],
      dimensions: {},
      dimension_options: [],
      effective_type: "type/Float",
      id: 137,
      base_type: "type/Float",
    });

    const fieldPickerType = getFieldPickerType(testField);
    expect(fieldPickerType).toBe("value");
  });
});
