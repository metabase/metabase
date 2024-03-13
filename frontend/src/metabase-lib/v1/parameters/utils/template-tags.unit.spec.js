import {
  getTemplateTags,
  getTemplateTagParameters,
  remapParameterValuesToTemplateTags,
} from "metabase-lib/v1/parameters/utils/template-tags";
import { createMockTemplateTag } from "metabase-types/api/mocks";

describe("parameters/utils/cards", () => {
  describe("getTemplateTags", () => {
    it("should return an empty array for an invalid card", () => {
      expect(getTemplateTags({})).toEqual([]);
    });

    it("should return an empty array for a non-native query", () => {
      const card = {
        dataset_query: {
          type: "query",
        },
      };
      expect(getTemplateTags(card)).toEqual([]);
    });

    it("should return an empty array for a non-parameterized query", () => {
      const card = {
        dataset_query: {
          type: "query",
          native: {
            query: "select * from PRODUCTS",
          },
        },
      };
      expect(getTemplateTags(card)).toEqual([]);
    });

    it("should extract the template tags", () => {
      const card = {
        dataset_query: {
          type: "native",
          native: {
            query: "select * from PRODUCTS where RATING > {{stars}}",
            "template-tags": {
              stars: {
                type: "number",
                name: "stars",
                id: "xyz777",
              },
              "snippet: foo": {
                type: "snippet",
                id: "abc123",
                name: "snippet: foo",
                "snippet-id": 6,
              },
            },
          },
        },
      };
      expect(getTemplateTags(card)).toEqual([
        {
          type: "number",
          name: "stars",
          id: "xyz777",
        },
        {
          id: "abc123",
          name: "snippet: foo",
          "snippet-id": 6,
          type: "snippet",
        },
      ]);
    });
  });

  describe("getTemplateTagParameters", () => {
    let tags;
    beforeEach(() => {
      tags = [
        {
          "widget-type": "foo",
          type: "string",
          id: 1,
          name: "a",
          "display-name": "A",
          default: "abc",
        },
        {
          type: "string",
          id: 2,
          name: "b",
          "display-name": "B",
        },
        {
          type: "number",
          id: 3,
          name: "c",
          "display-name": "C",
        },
        {
          type: "date",
          id: 4,
          name: "d",
          "display-name": "D",
        },
        {
          "widget-type": "foo",
          type: "dimension",
          id: 5,
          name: "e",
          "display-name": "E",
        },
        {
          type: null,
          id: 6,
        },
        {
          type: "dimension",
          id: 7,
          name: "f",
          "display-name": "F",
        },
      ];
    });

    it("should convert tags into tag parameters with field filter operator types", () => {
      const parametersWithFieldFilterOperatorTypes = [
        {
          default: "abc",
          id: 1,
          name: "A",
          slug: "a",
          target: ["variable", ["template-tag", "a"]],
          type: "foo",
        },
        {
          default: undefined,
          id: 2,
          name: "B",
          slug: "b",
          target: ["variable", ["template-tag", "b"]],
          type: "string/=",
        },
        {
          default: undefined,
          id: 3,
          name: "C",
          slug: "c",
          target: ["variable", ["template-tag", "c"]],
          type: "number/=",
        },
        {
          default: undefined,
          id: 4,
          name: "D",
          slug: "d",
          target: ["variable", ["template-tag", "d"]],
          type: "date/single",
        },
        {
          default: undefined,
          id: 5,
          name: "E",
          slug: "e",
          target: ["dimension", ["template-tag", "e"]],
          type: "foo",
        },
      ];

      expect(getTemplateTagParameters(tags)).toEqual(
        parametersWithFieldFilterOperatorTypes,
      );
    });

    it("should exclude tags that are not parameters", () => {
      const tags = [
        createMockTemplateTag({
          type: "string",
          id: "1",
          name: "a",
          "display-name": "A",
        }),
        createMockTemplateTag({
          type: "card",
          id: "2",
          "card-id": 123,
        }),
        createMockTemplateTag({
          type: "snippet",
          id: "3",
          "snippet-id": 1,
          "snippet-name": "C",
        }),
      ];
      expect(getTemplateTagParameters(tags)).toEqual([
        {
          default: undefined,
          id: "1",
          name: "A",
          slug: "a",
          target: ["variable", ["template-tag", "a"]],
          type: "string/=",
        },
      ]);
    });
  });

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
        "template-tag-3": null,
      });
    });
  });
});
