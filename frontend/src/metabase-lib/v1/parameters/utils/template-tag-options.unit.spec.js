import _ from "underscore";

import { PARAMETER_OPERATOR_TYPES } from "metabase-lib/v1/parameters/constants";

import {
  getParameterOptions,
  getParameterOptionsForField,
} from "./template-tag-options";

describe("parameters/utils/template-tag-options", () => {
  describe("getParameterOptions", () => {
    it("should return options with operator subtypes", () => {
      const options = new Set(_.map(getParameterOptions(), "type"));
      const expectedOptionTypes = ["id"].concat(
        _.map(PARAMETER_OPERATOR_TYPES.number, "type"),
        _.map(PARAMETER_OPERATOR_TYPES.string, "type"),
        _.map(PARAMETER_OPERATOR_TYPES.date, "type"),
      );

      expect(expectedOptionTypes.length).toEqual(options.size);
      expect(expectedOptionTypes.every(option => options.has(option))).toBe(
        true,
      );
    });

    it("should add a `combinedName` property to options", () => {
      const optionsByType = _.groupBy(getParameterOptions(), "type");

      expect(optionsByType["string/="][0].combinedName).toEqual("String");
      expect(optionsByType["string/!="][0].combinedName).toEqual(
        "String is not",
      );
      expect(optionsByType["number/!="][0].combinedName).toEqual(
        "Not equal to",
      );
      expect(optionsByType["date/single"][0].combinedName).toEqual(
        "Single Date",
      );
    });
  });

  describe("getParameterOptionsForField", () => {
    const field = {
      isDate: () => false,
      isID: () => false,
      isCategory: () => false,
      isCity: () => false,
      isState: () => false,
      isZipCode: () => false,
      isCountry: () => false,
      isNumber: () => false,
      isString: () => false,
      isLocation: () => false,
    };

    it("should return relevantly typed options for date field", () => {
      const dateField = {
        ...field,
        isDate: () => true,
      };
      const availableOptions = getParameterOptionsForField(dateField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("date")),
      ).toBe(true);
    });

    it("should return relevantly typed options for id field", () => {
      const idField = {
        ...field,
        isID: () => true,
      };
      const availableOptions = getParameterOptionsForField(idField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("id")),
      ).toBe(true);
    });

    it("should return string options for a location field", () => {
      const locationField = { ...field, isLocation: () => true };
      const availableOptions = getParameterOptionsForField(locationField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("string")),
      ).toBe(true);
    });
  });
});
