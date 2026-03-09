import _ from "underscore";

import type { ParameterSectionId } from "metabase-lib/v1/parameters/utils/operators";

import { getDashboardParameterSections } from "./dashboard-options";

describe("parameters/utils/dashboard-options", () => {
  describe("getDashboardParameterSections", () => {
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
        locationSection?.options.every((option) =>
          option.type.startsWith("string"),
        ),
      ).toBe(true);
    });

    it("should have a string section", () => {
      expect(
        _.findWhere(getDashboardParameterSections(), {
          id: "bad-section-id" as ParameterSectionId,
        }),
      ).not.toBeDefined();

      expect(
        _.findWhere(getDashboardParameterSections(), { id: "string" }),
      ).toBeDefined();
    });
  });
});
