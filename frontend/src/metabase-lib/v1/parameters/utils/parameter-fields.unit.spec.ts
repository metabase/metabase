import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { Field, FieldId } from "metabase-types/api";
import {
  createMockField,
  createMockFieldDimension,
} from "metabase-types/api/mocks";

import {
  getParameterFieldInfo,
  hasFields,
  hasRemappedFieldValues,
} from "./parameter-fields";

const TEXT_FIELD_ID = 2;
const OTHER_TEXT_FIELD_ID = 3;
const NUMBER_FIELD_ID = 4;

const createTextField = (id: FieldId, opts?: Partial<Field>) =>
  createMockField({ id, base_type: "type/Text", ...opts });

const createNumberField = (id: FieldId, opts?: Partial<Field>) =>
  createMockField({ id, base_type: "type/Integer", ...opts });

const createFieldRemappedTo = (
  displayFieldId: FieldId,
  displayField: Field,
  opts?: Partial<Field>,
) =>
  createMockField({
    ...opts,
    dimensions: [
      createMockFieldDimension({
        type: "external",
        human_readable_field_id: displayFieldId,
        human_readable_field: displayField,
      }),
    ],
  });

describe("hasFields", () => {
  it("should return true if there is at least one field in fields", () => {
    const field = getParameterFieldInfo(createMockField({ id: 1 }));
    expect(hasFields(createMockUiParameter({ fields: [field] }))).toBe(true);
    expect(hasFields(createMockUiParameter({ fields: [] }))).toBe(false);
    expect(hasFields(createMockUiParameter())).toBe(false);
  });
});

describe("getParameterFieldInfo", () => {
  it("describes field types", () => {
    expect(
      getParameterFieldInfo(
        createMockField({
          id: 1,
          display_name: "Total",
          base_type: "type/Float",
          has_field_values: "none",
          settings: { currency: "EUR" },
        }),
      ),
    ).toEqual({
      id: 1,
      displayName: "Total",
      searchFieldDisplayName: null,
      isString: false,
      isBoolean: false,
      isDate: false,
      isNumeric: true,
      settings: { currency: "EUR" },
      hasFieldValues: "none",
      hasRemappedValues: false,
    });
  });

  it("searches string field by itself", () => {
    expect(
      getParameterFieldInfo(createTextField(1, { display_name: "Email" })),
    ).toMatchObject({
      searchFieldDisplayName: "Email",
      isString: true,
      hasRemappedValues: false,
    });
  });

  it("searches field by display field of external dimension", () => {
    const field = createFieldRemappedTo(
      TEXT_FIELD_ID,
      createTextField(TEXT_FIELD_ID, { display_name: "Title" }),
      { base_type: "type/Integer" },
    );

    expect(getParameterFieldInfo(field)).toMatchObject({
      searchFieldDisplayName: "Title",
      hasRemappedValues: true,
    });
  });

  it("does not fall back to name field when external dimension carries no display field", () => {
    const field = createNumberField(1, {
      name_field: createTextField(OTHER_TEXT_FIELD_ID),
      dimensions: [
        createMockFieldDimension({
          type: "external",
          human_readable_field_id: TEXT_FIELD_ID,
        }),
      ],
    });

    expect(getParameterFieldInfo(field)).toMatchObject({
      searchFieldDisplayName: null,
      hasRemappedValues: false,
    });
  });

  it("searches PK by its name field", () => {
    const field = createNumberField(1, {
      semantic_type: "type/PK",
      name_field: createTextField(OTHER_TEXT_FIELD_ID, {
        display_name: "Name",
      }),
    });

    expect(getParameterFieldInfo(field)).toMatchObject({
      searchFieldDisplayName: "Name",
      hasRemappedValues: true,
    });
  });

  it("prefers name field of FK target over its own", () => {
    const field = createNumberField(1, {
      name_field: createTextField(OTHER_TEXT_FIELD_ID, { display_name: "Own" }),
      target: createNumberField(5, {
        name_field: createTextField(NUMBER_FIELD_ID, {
          display_name: "Target",
        }),
      }),
    });

    expect(getParameterFieldInfo(field)).toMatchObject({
      searchFieldDisplayName: "Target",
    });
  });

  it("has remapped values for internal dimension", () => {
    const field = createNumberField(1, {
      dimensions: [createMockFieldDimension({ type: "internal" })],
    });

    expect(getParameterFieldInfo(field)).toMatchObject({
      searchFieldDisplayName: null,
      hasRemappedValues: true,
    });
  });

  it("ignores remap target that cannot be searched", () => {
    const field = createFieldRemappedTo(
      NUMBER_FIELD_ID,
      createNumberField(NUMBER_FIELD_ID),
      { base_type: "type/Text", display_name: "Code" },
    );

    expect(getParameterFieldInfo(field)).toMatchObject({
      searchFieldDisplayName: "Code",
      hasRemappedValues: true,
    });
  });
});

describe("hasRemappedFieldValues", () => {
  const remappedField = getParameterFieldInfo(
    createFieldRemappedTo(TEXT_FIELD_ID, createTextField(TEXT_FIELD_ID)),
  );
  const plainField = getParameterFieldInfo(createTextField(1));

  it("is true when every field has remapped values", () => {
    expect(hasRemappedFieldValues([remappedField, remappedField])).toBe(true);
  });

  it("is false when some field has no remapped values", () => {
    expect(hasRemappedFieldValues([remappedField, plainField])).toBe(false);
  });

  it("is false for empty list", () => {
    expect(hasRemappedFieldValues([])).toBe(false);
  });
});
