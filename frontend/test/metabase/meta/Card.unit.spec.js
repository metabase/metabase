import * as Card from "metabase/meta/Card";

import { assocIn, dissoc } from "icepick";
import { getMetadata } from "metabase/selectors/metadata";

describe("metabase/meta/Card", () => {
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
        const url = Card.questionUrlWithParameters(card, metadata, []);
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: dissoc(card, "id"),
        });
      });
      it("should return question URL with query string parameter", () => {
        const url = Card.questionUrlWithParameters(
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
        const url = Card.questionUrlWithParameters(card, metadata, []);
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: dissoc(card, "id"),
        });
      });
      it("should return question URL with string MBQL filter added", () => {
        const url = Card.questionUrlWithParameters(
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

        const url = Card.questionUrlWithParameters(
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
        const url = Card.questionUrlWithParameters(
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
        const url = Card.questionUrlWithParameters(
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
        const url = Card.questionUrlWithParameters(
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

import { parse } from "url";
import { deserializeCardFromUrl } from "metabase/lib/card";

function parseUrl(url) {
  const parsed = parse(url, true);
  return {
    card: parsed.hash && deserializeCardFromUrl(parsed.hash),
    query: parsed.query,
    pathname: parsed.pathname,
  };
}
