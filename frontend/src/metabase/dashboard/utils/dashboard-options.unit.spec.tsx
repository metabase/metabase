import {
  getDashboardParameterSections,
  getDefaultOptionForParameterSectionMap,
} from "./dashboard-options";

describe("parameters/utils/dashboard-options", () => {
  describe("getDashboardParameterSections", () => {
    it("should have a number section", () => {
      expect(
        getDashboardParameterSections().find((item) => item.id === "number"),
      ).toBeDefined();
    });

    it("should have location options that map to string/* parameters", () => {
      const locationSection = getDashboardParameterSections().find(
        (item) => item.id === "location",
      );
      expect(
        locationSection?.options.every((option) =>
          option.type.startsWith("string"),
        ),
      ).toBe(true);
    });

    it("should have a string section", () => {
      const badSectionId: string = "bad-section-id";
      expect(
        getDashboardParameterSections().find(
          (item) => item.id === badSectionId,
        ),
      ).not.toBeDefined();

      expect(
        getDashboardParameterSections().find((item) => item.id === "string"),
      ).toBeDefined();
    });

    it("should have an id section with numeric and text subtypes", () => {
      const idSection = getDashboardParameterSections().find(
        (item) => item.id === "id",
      );
      expect(idSection).toBeDefined();
      expect(idSection?.options).toHaveLength(2);
      expect(idSection?.options.map((o) => o.type)).toEqual([
        "number/=",
        "string/=",
      ]);
    });
  });

  describe("getDefaultOptionForParameterSectionMap", () => {
    it("should default id section to number/=", () => {
      const map = getDefaultOptionForParameterSectionMap();
      expect(map.id.type).toBe("number/=");
    });
  });
});
