import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { Field, FieldId } from "metabase-types/api";
import {
  createMockField,
  createMockFieldDimension,
  createMockParameterField,
} from "metabase-types/api/mocks";

import {
  getExternalRemappedField,
  getRemappedField,
  getSearchField,
  getSharedRemappedField,
  hasFields,
  isSearchableField,
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
    const field = createMockParameterField({ id: 1 });
    const parameterWithFields = createMockUiParameter({
      fields: [field],
    });
    const parameterWithoutFields = createMockUiParameter({
      fields: [],
    });
    const parameterWithoutFieldsKey = createMockUiParameter();
    expect(hasFields(parameterWithFields)).toBe(true);
    expect(hasFields(parameterWithoutFields)).toBe(false);
    expect(hasFields(parameterWithoutFieldsKey)).toBe(false);
  });
});

describe("isSearchableField", () => {
  it("accepts string field", () => {
    expect(isSearchableField(createTextField(1))).toBe(true);
  });

  it("rejects number field", () => {
    expect(isSearchableField(createNumberField(1))).toBe(false);
  });
});

describe("getExternalRemappedField", () => {
  it("returns display field of external dimension", () => {
    const displayField = createTextField(TEXT_FIELD_ID);

    expect(
      getExternalRemappedField(
        createFieldRemappedTo(TEXT_FIELD_ID, displayField),
      ),
    ).toBe(displayField);
  });

  it("returns null when external dimension carries no display field", () => {
    const field = createMockField({
      name_field: createTextField(OTHER_TEXT_FIELD_ID),
      dimensions: [
        createMockFieldDimension({
          type: "external",
          human_readable_field_id: TEXT_FIELD_ID,
        }),
      ],
    });

    expect(getExternalRemappedField(field)).toBeNull();
  });

  it("falls back to field's own name field", () => {
    const nameField = createTextField(OTHER_TEXT_FIELD_ID);
    const field = createNumberField(1, {
      semantic_type: "type/PK",
      name_field: nameField,
    });

    expect(getExternalRemappedField(field)).toBe(nameField);
  });

  it("prefers name field of FK target over its own", () => {
    const targetNameField = createTextField(NUMBER_FIELD_ID);
    const field = createNumberField(1, {
      name_field: createTextField(OTHER_TEXT_FIELD_ID),
      target: createNumberField(5, { name_field: targetNameField }),
    });

    expect(getExternalRemappedField(field)).toBe(targetNameField);
  });

  it("returns null when nothing remaps field", () => {
    expect(getExternalRemappedField(createTextField(1))).toBeNull();
  });
});

describe("getRemappedField", () => {
  it("returns field itself for internal remapping", () => {
    const field = createMockField({
      dimensions: [createMockFieldDimension({ type: "internal" })],
    });

    expect(getRemappedField(field)).toBe(field);
  });

  it("returns external remap target otherwise", () => {
    const displayField = createTextField(TEXT_FIELD_ID);

    expect(
      getRemappedField(createFieldRemappedTo(TEXT_FIELD_ID, displayField)),
    ).toBe(displayField);
  });
});

describe("getSharedRemappedField", () => {
  it("returns target when every field remaps to it", () => {
    const displayField = createTextField(TEXT_FIELD_ID);

    expect(
      getSharedRemappedField([
        createFieldRemappedTo(TEXT_FIELD_ID, displayField, { id: 10 }),
        createFieldRemappedTo(TEXT_FIELD_ID, displayField, { id: 11 }),
      ]),
    ).toBe(displayField);
  });

  it("returns null when fields remap to different targets", () => {
    expect(
      getSharedRemappedField([
        createFieldRemappedTo(TEXT_FIELD_ID, createTextField(TEXT_FIELD_ID), {
          id: 10,
        }),
        createFieldRemappedTo(
          OTHER_TEXT_FIELD_ID,
          createTextField(OTHER_TEXT_FIELD_ID),
          { id: 11 },
        ),
      ]),
    ).toBeNull();
  });

  it("returns null for empty list", () => {
    expect(getSharedRemappedField([])).toBeNull();
  });
});

describe("getSearchField", () => {
  it("returns searchable field itself", () => {
    const field = createTextField(1);

    expect(getSearchField(field)).toBe(field);
  });

  it("returns null for field that cannot be searched", () => {
    expect(getSearchField(createNumberField(1))).toBeNull();
  });

  it("returns remap target when it is searchable", () => {
    const displayField = createTextField(TEXT_FIELD_ID);
    const field = createFieldRemappedTo(TEXT_FIELD_ID, displayField, {
      base_type: "type/Integer",
    });

    expect(getSearchField(field)).toBe(displayField);
  });

  it("ignores remap target that cannot be searched", () => {
    const field = createFieldRemappedTo(
      NUMBER_FIELD_ID,
      createNumberField(NUMBER_FIELD_ID),
      { base_type: "type/Text" },
    );

    expect(getSearchField(field)).toBe(field);
  });
});
