import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import type { Field } from "metabase-types/api";
import { createMockField as _createMockField } from "metabase-types/api/mocks";
import { getFieldPickerType } from "./utils";

function setup(field: Field) {
  const metadata = createMockMetadata({ fields: [field] });
  return checkNotNull(metadata.field(field.id));
}

function setupMany(fields: Field[]) {
  const metadata = createMockMetadata({ fields });
  return fields.map(field => checkNotNull(metadata.field(field.id)));
}

function createMockField(opts?: Partial<Field>): Field {
  return _createMockField({
    has_field_values: "none",
    semantic_type: null,
    ...opts,
  });
}

describe("getFieldPickerType", () => {
  it("text field with list field values renders a category picker", () => {
    const field = setup(
      createMockField({
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
        has_field_values: "list",
        values: [["Michaelangelo"], ["Donatello"], ["Raphael"], ["Leonardo"]],
      }),
    );
    const fieldPickerType = getFieldPickerType(field);
    expect(fieldPickerType).toBe("category");
  });

  it("time field does not render a date component", () => {
    const [timeField, timeTZField] = setupMany([
      createMockField({
        id: 1,
        base_type: "type/Time",
        effective_type: "type/Time",
      }),
      createMockField({
        id: 2,
        base_type: "type/TimeWithTZ",
        effective_type: "type/TimeWithTZ",
      }),
    ]);

    const fieldPickerType = getFieldPickerType(timeField);
    expect(fieldPickerType).toBe("other");

    const fieldPickerType2 = getFieldPickerType(timeTZField);
    expect(fieldPickerType2).toBe("other");
  });

  it("date field renders a date component", () => {
    const field = setup(
      createMockField({
        base_type: "type/Date",
        effective_type: "type/Date",
      }),
    );
    const fieldPickerType = getFieldPickerType(field);
    expect(fieldPickerType).toBe("date");
  });

  it("datetime field renders a date component", () => {
    const [dateTimeField, dateTimeTZField] = setupMany([
      createMockField({
        id: 1,
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
      }),
      createMockField({
        id: 2,
        base_type: "type/DateTimeWithLocalTZ",
        effective_type: "type/DateTimeWithLocalTZ",
      }),
    ]);

    const fieldPickerType = getFieldPickerType(dateTimeField);
    expect(fieldPickerType).toBe("date");

    const fieldPickerType2 = getFieldPickerType(dateTimeTZField);
    expect(fieldPickerType2).toBe("date");
  });

  it("text field renders a value component", () => {
    const field = setup(
      createMockField({
        base_type: "type/Text",
        effective_type: "type/Text",
      }),
    );
    const fieldPickerType = getFieldPickerType(field);
    expect(fieldPickerType).toBe("value");
  });

  it("int field renders a value component", () => {
    const field = setup(
      createMockField({
        base_type: "type/Integer",
        effective_type: "type/Integer",
      }),
    );

    const fieldPickerType = getFieldPickerType(field);
    expect(fieldPickerType).toBe("value");
  });

  it("float field renders a value component", () => {
    const field = setup(
      createMockField({
        base_type: "type/Float",
        effective_type: "type/Float",
      }),
    );
    const fieldPickerType = getFieldPickerType(field);
    expect(fieldPickerType).toBe("value");
  });
});
