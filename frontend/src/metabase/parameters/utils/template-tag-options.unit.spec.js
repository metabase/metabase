import _ from "underscore";
import MetabaseSettings from "metabase/lib/settings";
import { PARAMETER_OPERATOR_TYPES } from "../constants";
import {
  getParameterOptions,
  getParameterOptionsForField,
} from "./template-tag-options";

MetabaseSettings.get = jest.fn();

function mockFieldFilterOperatorsFlag(value) {
  MetabaseSettings.get.mockImplementation(flag => {
    if (flag === "field-filter-operators-enabled?") {
      return value;
    }
  });
}

describe("parameters/utils/template-tag-options", () => {
  beforeEach(() => {
    mockFieldFilterOperatorsFlag(false);
  });

  describe("getParameterOptions", () => {
    describe("when `field-filter-operators-enabled?` is false", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(false);
      });

      it("should return options without operator subtypes (except for date parameters)", () => {
        const options = new Set(_.map(getParameterOptions(), "type"));
        const expectedOptionTypes = [
          "id",
          "category",
          "location/city",
          "location/state",
          "location/zip_code",
          "location/country",
        ].concat(_.map(PARAMETER_OPERATOR_TYPES.date, "type"));

        expect(expectedOptionTypes.length).toEqual(options.size);
        expect(expectedOptionTypes.every(option => options.has(option))).toBe(
          true,
        );
      });
    });

    describe("when `field-filter-operators-enabled?` is true", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(true);
      });

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
        const optionsByType = _.indexBy(getParameterOptions(), "type");

        expect(optionsByType["string/="].combinedName).toEqual("String");
        expect(optionsByType["string/!="].combinedName).toEqual(
          "String is not",
        );
        expect(optionsByType["number/!="].combinedName).toEqual("Not equal to");
        expect(optionsByType["date/single"].combinedName).toEqual(
          "Single Date",
        );
      });
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

    it("should return the specific location/state option for a state field", () => {
      const stateField = {
        ...field,
        isState: () => true,
      };
      const availableOptions = getParameterOptionsForField(stateField);
      expect(availableOptions).toEqual([
        expect.objectContaining({ type: "location/state" }),
      ]);
    });

    it("as a result of all location parameters haiving subtypes should return nothing for a generic location field", () => {
      const locationField = { ...field, isLocation: () => true };
      const availableOptions = getParameterOptionsForField(locationField);
      expect(availableOptions).toEqual([]);
    });
  });
});
