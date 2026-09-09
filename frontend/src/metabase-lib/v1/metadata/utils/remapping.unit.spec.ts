import type { Field, FieldId } from "metabase-types/api";
import {
  createMockField,
  createMockFieldDimension,
} from "metabase-types/api/mocks";

import {
  getExternalRemappedField,
  getRemappedField,
  getSearchField,
  getSharedRemappedField,
  isSearchableField,
} from "./remapping";

const TEXT_FIELD_ID = 2;
const OTHER_TEXT_FIELD_ID = 3;
const NUMBER_FIELD_ID = 4;

const createTextField = (id: FieldId, opts?: Partial<Field>) =>
  createMockField({ id, base_type: "type/Text", ...opts });

const createNumberField = (id: FieldId, opts?: Partial<Field>) =>
  createMockField({ id, base_type: "type/Integer", ...opts });

/**
 * A field whose dimension carries `displayField` as its remap target, the way
 * the API nests it.
 */
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

describe("isSearchableField", () => {
  it("accepts a string field", () => {
    expect(isSearchableField(createTextField(1))).toBe(true);
  });

  it("rejects a number field", () => {
    expect(isSearchableField(createNumberField(1))).toBe(false);
  });
});

describe("getExternalRemappedField", () => {
  it("returns the display field the dimension carries", () => {
    const displayField = createTextField(TEXT_FIELD_ID);

    expect(
      getExternalRemappedField(
        createFieldRemappedTo(TEXT_FIELD_ID, displayField),
      ),
    ).toBe(displayField);
  });

  it("returns null when the dimension names a display field it does not carry", () => {
    // the id is what decides, so a field whose display field never arrived
    // remaps to nothing rather than falling back to its name field
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

  it("falls back to the field's own name field", () => {
    const nameField = createTextField(OTHER_TEXT_FIELD_ID);
    const field = createNumberField(1, {
      semantic_type: "type/PK",
      name_field: nameField,
    });

    expect(getExternalRemappedField(field)).toBe(nameField);
  });

  it("prefers the name field of an FK target over its own", () => {
    const targetNameField = createTextField(NUMBER_FIELD_ID);
    const field = createNumberField(1, {
      name_field: createTextField(OTHER_TEXT_FIELD_ID),
      target: createNumberField(5, { name_field: targetNameField }),
    });

    expect(getExternalRemappedField(field)).toBe(targetNameField);
  });

  it("returns null when nothing remaps the field", () => {
    expect(getExternalRemappedField(createTextField(1))).toBeNull();
  });
});

describe("getRemappedField", () => {
  it("returns the field itself when the remapping is internal", () => {
    const field = createMockField({
      dimensions: [createMockFieldDimension({ type: "internal" })],
    });

    expect(getRemappedField(field)).toBe(field);
  });

  it("returns the external remap target otherwise", () => {
    const displayField = createTextField(TEXT_FIELD_ID);

    expect(
      getRemappedField(createFieldRemappedTo(TEXT_FIELD_ID, displayField)),
    ).toBe(displayField);
  });
});

describe("getSharedRemappedField", () => {
  it("returns the target when every field remaps to it", () => {
    const displayField = createTextField(TEXT_FIELD_ID);

    expect(
      getSharedRemappedField([
        createFieldRemappedTo(TEXT_FIELD_ID, displayField, { id: 10 }),
        createFieldRemappedTo(TEXT_FIELD_ID, displayField, { id: 11 }),
      ]),
    ).toBe(displayField);
  });

  it("returns null when the fields remap to different targets", () => {
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

  it("returns null for an empty list", () => {
    expect(getSharedRemappedField([])).toBeNull();
  });
});

describe("getSearchField", () => {
  it("returns a searchable field itself", () => {
    const field = createTextField(1);

    expect(getSearchField(field)).toBe(field);
  });

  it("returns null for a field that cannot be searched", () => {
    expect(getSearchField(createNumberField(1))).toBeNull();
  });

  it("returns the remap target when it is searchable", () => {
    const displayField = createTextField(TEXT_FIELD_ID);
    const field = createFieldRemappedTo(TEXT_FIELD_ID, displayField, {
      base_type: "type/Integer",
    });

    expect(getSearchField(field)).toBe(displayField);
  });

  it("ignores a remap target that cannot be searched", () => {
    const field = createFieldRemappedTo(
      NUMBER_FIELD_ID,
      createNumberField(NUMBER_FIELD_ID),
      {
        base_type: "type/Text",
      },
    );

    expect(getSearchField(field)).toBe(field);
  });

  describe("when PK remapping is disabled", () => {
    it("searches a string PK through itself, not its remap target", () => {
      const field = createFieldRemappedTo(
        TEXT_FIELD_ID,
        createTextField(TEXT_FIELD_ID),
        {
          base_type: "type/Text",
          semantic_type: "type/PK",
        },
      );

      expect(getSearchField(field, true)).toBe(field);
    });

    it("returns null for a number PK", () => {
      const field = createFieldRemappedTo(
        TEXT_FIELD_ID,
        createTextField(TEXT_FIELD_ID),
        {
          base_type: "type/Integer",
          semantic_type: "type/PK",
        },
      );

      expect(getSearchField(field, true)).toBeNull();
    });

    it("still remaps a field that is not a PK", () => {
      const displayField = createTextField(TEXT_FIELD_ID);
      const field = createFieldRemappedTo(TEXT_FIELD_ID, displayField, {
        base_type: "type/Integer",
      });

      expect(getSearchField(field, true)).toBe(displayField);
    });
  });
});
