import { remapParameterValuesToTemplateTags } from "./cards";

describe("parameters/utils/cards", () => {
  describe("remapParameterValuesToTemplateTags", () => {
    it("should convert a dashboard parameterValues map into a map of template tag values", () => {
      const parameterValues = {
        "dashboard-parameter-1": "aaa",
        "dashboard-parameter-2": "bbb",
        "dashboard-parameter-3": null,
        "dashboard-parameter-4": "ddd",
      };

      const dashboardParameters = [
        {
          id: "dashboard-parameter-1",
          target: ["variable", ["template-tag", "template-tag-1"]],
        },
        {
          id: "dashboard-parameter-2",
          target: ["dimension", ["template-tag", "template-tag-2"]],
        },
        {
          id: "dashboard-parameter-3",
          target: ["dimension", ["template-tag", "template-tag-3"]],
        },
        {
          id: "dashboard-parameter-4",
          target: ["dimension", ["field", 1, null]],
        },
        {
          id: "dashboard-parameter-5",
        },
      ];

      const templateTags = [
        {
          name: "template-tag-1",
        },
        {
          name: "template-tag-2",
        },
        {
          name: "template-tag-3",
        },
      ];

      expect(
        remapParameterValuesToTemplateTags(
          templateTags,
          dashboardParameters,
          parameterValues,
        ),
      ).toEqual({
        "template-tag-1": "aaa",
        "template-tag-2": "bbb",
      });
    });
  });
});
