import { groupBy } from "es-toolkit";

import Field from "metabase-lib/v1/metadata/Field";
import { PARAMETER_OPERATOR_TYPES } from "metabase-lib/v1/parameters/constants";
import type { NormalizedField } from "metabase-types/api";
import {
  createMockField as createMockApiField,
  createMockNormalizedField,
  createMockTemplateTag,
} from "metabase-types/api/mocks";

import {
  getDefaultParameterWidgetType,
  getParameterOptions,
  getParameterOptionsForField,
} from "./template-tag-options";

function createMockField(field: Partial<NormalizedField>): Field {
  return new Field(
    createMockNormalizedField({
      base_type: "type/*",
      semantic_type: null,
      has_field_values: "none",
      ...field,
    }),
  );
}

describe("parameters/utils/template-tag-options", () => {
  describe("getParameterOptions", () => {
    it("should return options with operator subtypes", () => {
      const options = new Set(
        getParameterOptions().map((option) => option.type),
      );
      const expectedOptionTypes = ["id", "boolean/="].concat(
        PARAMETER_OPERATOR_TYPES.number.map((option) => option.type),
        PARAMETER_OPERATOR_TYPES.string.map((option) => option.type),
        PARAMETER_OPERATOR_TYPES.date.map((option) => option.type),
      );

      expect(expectedOptionTypes.length).toEqual(options.size);
      expect(expectedOptionTypes.every((option) => options.has(option))).toBe(
        true,
      );
    });

    it("should add a `combinedName` property to options", () => {
      const optionsByType = groupBy(getParameterOptions(), (item) => item.type);

      expect(optionsByType["string/="][0]).toMatchObject({
        combinedName: "String",
      });
      expect(optionsByType["string/!="][0]).toMatchObject({
        combinedName: "String is not",
      });
      expect(optionsByType["number/!="][0]).toMatchObject({
        combinedName: "Not equal to",
      });
      expect(optionsByType["date/single"][0]).toMatchObject({
        combinedName: "Single Date",
      });
    });
  });

  describe("getParameterOptionsForField", () => {
    it("should return relevantly typed options for date field", () => {
      const dateField = createMockField({ base_type: "type/DateTime" });
      const availableOptions = getParameterOptionsForField(dateField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("date")),
      ).toBe(true);
    });

    it("should return relevantly typed options for id field", () => {
      const idField = createMockField({ semantic_type: "type/PK" });
      const availableOptions = getParameterOptionsForField(idField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("id")),
      ).toBe(true);
    });

    it("should return string options for an address field", () => {
      const addressField = createMockField({
        base_type: "type/Text",
        semantic_type: "type/Address",
      });
      const availableOptions = getParameterOptionsForField(addressField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("string")),
      ).toBe(true);
    });

    it("should return string options for a TextLike field", () => {
      const enumField = createMockField({ base_type: "type/TextLike" });
      const availableOptions = getParameterOptionsForField(enumField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("string")),
      ).toBe(true);
    });

    it("should return only the boolean option for a boolean field", () => {
      const booleanField = createMockField({ base_type: "type/Boolean" });
      const availableOptions = getParameterOptionsForField(booleanField);
      expect(availableOptions.map((option) => option.type)).toEqual([
        "boolean/=",
      ]);
    });
  });

  describe("getDefaultParameterWidgetType", () => {
    const tag = createMockTemplateTag({
      type: "dimension",
      "widget-type": undefined,
    });

    it("should default to id for a PK field", () => {
      const idField = createMockApiField({ semantic_type: "type/PK" });
      expect(getDefaultParameterWidgetType(tag, idField)).toBe("id");
    });

    it("should default to boolean/= for a boolean field", () => {
      const booleanField = createMockApiField({
        base_type: "type/Boolean",
        semantic_type: null,
      });
      expect(getDefaultParameterWidgetType(tag, booleanField)).toBe(
        "boolean/=",
      );
    });
  });
});
