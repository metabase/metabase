import _ from "underscore";
import MetabaseSettings from "metabase/lib/settings";
import { getDashboardParameterSections } from "./dashboard-options";

MetabaseSettings.get = jest.fn();

function mockFieldFilterOperatorsFlag(value) {
  MetabaseSettings.get.mockImplementation(flag => {
    if (flag === "field-filter-operators-enabled?") {
      return value;
    }
  });
}

describe("parameters/utils/dashboard-options", () => {
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
});
