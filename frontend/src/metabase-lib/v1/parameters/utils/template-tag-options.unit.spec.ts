import _ from "underscore";

import Field from "metabase-lib/v1/metadata/Field";
import { PARAMETER_OPERATOR_TYPES } from "metabase-lib/v1/parameters/constants";
import { createMockNormalizedField } from "metabase-types/api/mocks";

import {
  getParameterOptions,
  getParameterOptionsForField,
} from "./template-tag-options";

function createMockField(mocks: Partial<Field>): Field {
  return Object.assign(new Field(createMockNormalizedField({})), mocks);
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
      const optionsByType = _.groupBy(getParameterOptions(), "type");

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
    const fieldPredicates = {
      isDate: () => false,
      isID: () => false,
      isNumeric: () => false,
      isString: () => false,
      isStringLike: () => false,
      isBoolean: () => false,
      isAddress: () => false,
    };

    it("should return relevantly typed options for date field", () => {
      const dateField = createMockField({
        ...fieldPredicates,
        isDate: () => true,
      });
      const availableOptions = getParameterOptionsForField(dateField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("date")),
      ).toBe(true);
    });

    it("should return relevantly typed options for id field", () => {
      const idField = createMockField({
        ...fieldPredicates,
        isID: () => true,
      });
      const availableOptions = getParameterOptionsForField(idField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("id")),
      ).toBe(true);
    });

    it("should return string options for an address field", () => {
      const addressField = createMockField({
        ...fieldPredicates,
        isString: () => true,
        isAddress: () => true,
      });
      const availableOptions = getParameterOptionsForField(addressField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("string")),
      ).toBe(true);
    });

    it("should return string options for a TextLike field", () => {
      const enumField = createMockField({
        ...fieldPredicates,
        isString: () => false,
        isStringLike: () => true,
      });
      const availableOptions = getParameterOptionsForField(enumField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every((option) => option.type.startsWith("string")),
      ).toBe(true);
    });
  });
});
