import { assocIn, dissoc } from "icepick";
import { parse } from "url";

import MetabaseSettings from "metabase/lib/settings";
import { deserializeCardFromUrl } from "metabase/lib/card";
import { getMetadata } from "metabase/selectors/metadata";

import { getTemplateTagParameters, questionUrlWithParameters } from "./cards";

function parseUrl(url) {
  const parsed = parse(url, true);
  return {
    card: parsed.hash && deserializeCardFromUrl(parsed.hash),
    query: parsed.query,
    pathname: parsed.pathname,
  };
}

MetabaseSettings.get = jest.fn();

function mockFieldFilterOperatorsFlag(value) {
  MetabaseSettings.get.mockImplementation(flag => {
    if (flag === "field-filter-operators-enabled?") {
      return value;
    }
  });
}

describe("parameters/utils/cards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MetabaseSettings.get.mockReturnValue(false);
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

    describe("field filter operators enabled", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(true);
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
    });

    describe("field filter operators disabled", () => {
      it("should convert tags into tag parameters", () => {
        const parameters = [
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
            type: "category",
          },
          {
            default: undefined,
            id: 3,
            name: "C",
            slug: "c",
            target: ["variable", ["template-tag", "c"]],
            type: "category",
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
        expect(getTemplateTagParameters(tags)).toEqual(parameters);
      });
    });
  });

  describe("questionUrlWithParameters", () => {
    const metadata = getMetadata({
      entities: {
        databases: {},
        schemas: {},
        tables: {},
        fields: {
          2: {
            base_type: "type/Integer",
          },
        },
        metrics: {},
        segments: {},
      },
    });

    const parameters = [
      {
        id: 1,
        slug: "param_string",
        type: "category",
      },
      {
        id: 2,
        slug: "param_operator",
        type: "category/starts-with",
      },
      {
        id: 3,
        slug: "param_date",
        type: "date/month",
      },
      {
        id: 4,
        slug: "param_fk",
        type: "date/month",
      },
      {
        id: 5,
        slug: "param_number",
        type: "number/=",
      },
    ];

    describe("with SQL card", () => {
      const card = {
        id: 1,
        dataset_query: {
          type: "native",
          native: {
            "template-tags": {
              baz: { name: "baz", type: "text" },
            },
          },
        },
      };
      const parameterMappings = [
        {
          card_id: 1,
          parameter_id: 1,
          target: ["variable", ["template-tag", "baz"]],
        },
      ];
      it("should return question URL with no parameters", () => {
        const url = questionUrlWithParameters(card, metadata, []);
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: dissoc(card, "id"),
        });
      });
      it("should return question URL with query string parameter", () => {
        const url = questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "1": "bar" },
          parameterMappings,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: { baz: "bar" },
          card: dissoc(card, "id"),
        });
      });
    });
    describe("with structured card", () => {
      const card = {
        id: 1,
        dataset_query: {
          type: "query",
          query: {
            "source-table": 1,
          },
        },
      };
      const parameterMappings = [
        {
          card_id: 1,
          parameter_id: 1,
          target: ["dimension", ["field", 1, null]],
        },
        {
          card_id: 1,
          parameter_id: 2,
          target: ["dimension", ["field", 2, null]],
        },
        {
          card_id: 1,
          parameter_id: 3,
          target: ["dimension", ["field", 3, null]],
        },
        {
          card_id: 1,
          parameter_id: 4,
          target: ["dimension", ["field", 5, { "source-field": 4 }]],
        },
        {
          card_id: 1,
          parameter_id: 5,
          target: ["dimension", ["field", 2, null]],
        },
      ];
      it("should return question URL with no parameters", () => {
        const url = questionUrlWithParameters(card, metadata, []);
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: dissoc(card, "id"),
        });
      });
      it("should return question URL with string MBQL filter added", () => {
        const url = questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "1": "bar" },
          parameterMappings,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: assocIn(
            dissoc(card, "id"),
            ["dataset_query", "query", "filter"],
            ["and", ["=", ["field", 1, null], "bar"]],
          ),
        });
      });
      it("should return question URL even if only original_card_id is present", () => {
        const cardWithOnlyOriginalCardId = {
          ...card,
          id: undefined,
          original_card_id: card.id,
        };

        const url = questionUrlWithParameters(
          cardWithOnlyOriginalCardId,
          metadata,
          parameters,
          { "1": "bar" },
          parameterMappings,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: assocIn(
            cardWithOnlyOriginalCardId,
            ["dataset_query", "query", "filter"],
            ["and", ["=", ["field", 1, null], "bar"]],
          ),
        });
      });

      it("should return question URL with number MBQL filter added", () => {
        const url = questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "5": 123 },
          parameterMappings,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: assocIn(
            dissoc(card, "id"),
            ["dataset_query", "query", "filter"],
            ["and", ["=", ["field", 2, null], 123]],
          ),
        });
      });

      it("should return question URL with date MBQL filter added", () => {
        const url = questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "3": "2017-05" },
          parameterMappings,
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: assocIn(
            dissoc(card, "id"),
            ["dataset_query", "query", "filter"],
            [
              "and",
              ["=", ["field", 3, { "temporal-unit": "month" }], "2017-05-01"],
            ],
          ),
        });
      });
      it("should return question URL with date MBQL filter on a FK added", () => {
        const url = questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "4": "2017-05" },
          parameterMappings,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: assocIn(
            dissoc(card, "id"),
            ["dataset_query", "query", "filter"],
            [
              "and",
              [
                "=",
                ["field", 5, { "source-field": 4, "temporal-unit": "month" }],
                "2017-05-01",
              ],
            ],
          ),
        });
      });
    });
  });
});
