import * as Card from "metabase/meta/Card";
import { parse } from "url";
import { assocIn, dissoc } from "icepick";

import { deserializeCardFromUrl } from "metabase/lib/card";
import { metadata } from "__support__/sample_dataset_fixture";

describe("metabase/meta/Card", () => {
  describe("questionUrlWithParameters", () => {
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
      const cardWithTextFilter = {
        id: 1,
        dataset_query: {
          type: "native",
          native: {
            "template-tags": {
              baz: { name: "baz", type: "text", id: "foo" },
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
        {
          card_id: 2,
          parameter_id: 5,
          target: ["dimension", ["template-tag", "bar"]],
        },
      ];

      const cardWithFieldFilter = {
        id: 2,
        dataset_query: {
          type: "native",
          native: {
            "template-tags": {
              bar: { name: "bar", type: "number/=", id: "abc" },
            },
          },
        },
      };

      const dashcard = {
        parameter_mappings: parameterMappings,
        dashboardId: 1,
      };

      it("should return question URL when there are no parameters", () => {
        const parameters = [];
        const parameterValues = {};
        const url = Card.questionUrlWithParameters(
          cardWithTextFilter,
          metadata,
          parameters,
          parameterValues,
          dashcard,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: {},
          card: null,
        });
      });

      it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's variable", () => {
        const url = Card.questionUrlWithParameters(
          cardWithTextFilter,
          metadata,
          parameters,
          { "1": "bar" },
          dashcard,
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: { baz: "bar" },
          card: null,
        });
      });

      it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's field filter", () => {
        const url = Card.questionUrlWithParameters(
          cardWithFieldFilter,
          metadata,
          parameters,
          { "5": 111 },
          dashcard,
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question/2",
          query: { bar: "111" },
          card: null,
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
          target: ["dimension", ["field", 2, { "source-field": 1 }]],
        },
        {
          card_id: 1,
          parameter_id: 5,
          target: ["dimension", ["field", 2, null]],
        },
      ];

      const dashcard = {
        parameter_mappings: parameterMappings,
        dashboardId: 1,
      };

      it("should return question URL with no parameters", () => {
        const parameters = [];
        const parameterValues = {};

        const url = Card.questionUrlWithParameters(
          card,
          metadata,
          parameters,
          parameterValues,
          dashcard,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: {},
          card: null,
        });
      });

      it("should return question URL with string MBQL filter added", () => {
        const url = Card.questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "1": "bar" },
          dashcard,
        );

        const deserializedCard = {
          ...assocIn(
            dissoc(card, "id"),
            ["dataset_query", "query", "filter"],
            ["=", ["field", 1, null], "bar"],
          ),
          original_card_id: card.id,
          parameters: [],
        };

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: deserializedCard,
        });
      });

      it("should return question URL with number MBQL filter added", () => {
        const url = Card.questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "5": 123 },
          dashcard,
        );
        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: {
            ...assocIn(
              dissoc(card, "id"),
              ["dataset_query", "query", "filter"],
              ["=", ["field", 2, null], 123],
            ),
            original_card_id: card.id,
            parameters: [],
          },
        });
      });

      it("should return question URL with date MBQL filter added", () => {
        const url = Card.questionUrlWithParameters(
          card,
          metadata,
          parameters,
          { "3": "2017-05" },
          dashcard,
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: {
            ...assocIn(
              dissoc(card, "id"),
              ["dataset_query", "query", "filter"],
              ["=", ["field", 3, { "temporal-unit": "month" }], "2017-05-01"],
            ),
            original_card_id: card.id,
            parameters: [],
          },
        });
      });
    });
  });
});

function parseUrl(url) {
  const parsed = parse(url, true);
  return {
    card: parsed.hash && deserializeCardFromUrl(parsed.hash),
    query: parsed.query,
    pathname: parsed.pathname,
  };
}
