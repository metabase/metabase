import _ from "underscore";
import MetabaseSettings from "metabase/lib/settings";
import { PARAMETER_OPERATOR_TYPES } from "../constants";
import {
  getDashboardParameterSections,
  getParameterOptionsForField,
} from "./options";

MetabaseSettings.get = jest.fn();

function mockFieldFilterOperatorsFlag(value) {
  MetabaseSettings.get.mockImplementation(flag => {
    if (flag === "field-filter-operators-enabled?") {
      return value;
    }
  });
}

describe("parameters/utils/options", () => {
  describe("getDashboardParameterSections", () => {
    beforeEach(() => {
      mockFieldFilterOperatorsFlag(false);
    });

    describe("when `field-filter-operators-enabled?` is false", () => {
      it("should not have a number section", () => {
        expect(
          _.findWhere(getDashboardParameterSections(), { id: "number" }),
        ).not.toBeDefined();
      });

      it("should have location options that map to location/* parameters", () => {
        const locationSection = _.findWhere(getDashboardParameterSections(), {
          id: "location",
        });
        expect(
          locationSection.options.every(option =>
            option.type.startsWith("location"),
          ),
        ).toBe(true);
      });

      it("should have a category section", () => {
        expect(
          _.findWhere(getDashboardParameterSections(), { id: "category" }),
        ).toBeDefined();

        expect(
          _.findWhere(getDashboardParameterSections(), { id: "string" }),
        ).not.toBeDefined();
      });
    });

    describe("when `field-filter-operators-enabled?` is true", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(true);
      });

      it("should have a number section", () => {
        expect(
          _.findWhere(getDashboardParameterSections(), { id: "number" }),
        ).toBeDefined();
      });

      it("should have location options that map to string/* parameters", () => {
        const locationSection = _.findWhere(getDashboardParameterSections(), {
          id: "location",
        });
        expect(
          locationSection.options.every(option =>
            option.type.startsWith("string"),
          ),
        ).toBe(true);
      });

      it("should have a string section", () => {
        expect(
          _.findWhere(getDashboardParameterSections(), { id: "category" }),
        ).not.toBeDefined();

        expect(
          _.findWhere(getDashboardParameterSections(), { id: "string" }),
        ).toBeDefined();
      });
    });
  });

  describe("getParameterOptionsForField", () => {
    describe("when `field-filter-operators-enabled?` is false", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(false);
      });

      it("should return options without operator subtypes (except for date parameters)", () => {
        const options = new Set(_.map(getParameterOptionsForField(), "type"));
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
        const options = new Set(_.map(getParameterOptionsForField(), "type"));
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
        const optionsByType = _.indexBy(getParameterOptionsForField(), "type");

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
});
