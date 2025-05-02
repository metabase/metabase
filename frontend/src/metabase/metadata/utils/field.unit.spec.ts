import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersProductIdField,
  createPeopleCreatedAtField,
  createPeopleNameField,
} from "metabase-types/api/mocks/presets";

import {
  canCoerceFieldType,
  getFieldDisplayName,
  getRawTableFieldId,
} from "./field";

describe("canCoerceFieldType", () => {
  it("should return true when field is not FK and is coerceable", () => {
    const field = createPeopleNameField();

    expect(canCoerceFieldType(field)).toBe(true);
  });

  it("should return false when field is FK", () => {
    const field = createOrdersProductIdField();

    expect(canCoerceFieldType(field)).toBe(false);
  });

  it("should return false when field is not coerceable", () => {
    const field = createPeopleCreatedAtField();

    expect(canCoerceFieldType(field)).toBe(false);
  });
});

describe("getRawTableFieldId", () => {
  it("should return the field id when it's a number", () => {
    const field = createMockField({ id: 123 });

    expect(getRawTableFieldId(field)).toBe(123);
  });

  it("should throw an error when field id is not a number", () => {
    const field = createMockField({ id: ["field", 1, null] });

    expect(() => getRawTableFieldId(field)).toThrow(
      "getRawFieldId supports only raw table fields",
    );
  });
});

describe("getFieldDisplayName", () => {
  it("should return dimension name when available", () => {
    const field = createMockField({
      name: "Name",
      display_name: "My field",
      dimensions: [{ type: "internal", name: "Dimension Name" }],
    });

    expect(getFieldDisplayName(field)).toBe("Dimension Name");
  });

  it("should return display_name when dimensions are not available", () => {
    const field = createMockField({
      name: "Name",
      display_name: "My field",
    });

    expect(getFieldDisplayName(field)).toBe("My field");
  });

  it("should return name when neither dimensions nor display_name are available", () => {
    const field = createMockField({
      name: "Name",
      display_name: undefined,
    });

    expect(getFieldDisplayName(field)).toBe("Name");
  });

  it("should return name when neither dimensions are not available and display_name is empty", () => {
    const field = createMockField({
      name: "Name",
      display_name: "",
    });

    expect(getFieldDisplayName(field)).toBe("Name");
  });

  it("should return (empty) when no name is available", () => {
    const field = createMockField({
      name: "",
      display_name: "",
    });

    expect(getFieldDisplayName(field)).toBe(NULL_DISPLAY_VALUE);
  });

  it("should handle empty dimensions array", () => {
    const field = createMockField({
      display_name: "My field",
      dimensions: [],
    });

    expect(getFieldDisplayName(field)).toBe("My field");
  });
});
