import { parse } from "url";

import { assoc, dissoc } from "icepick";

import { createMockMetadata } from "__support__/metadata";
// eslint-disable-next-line no-restricted-imports
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import * as Lib from "metabase-lib";
import {
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import Question from "./Question";
import type { ParameterWithTarget } from "./parameters/types";
import { getQuestionUrl, getQuestionUrlWithParameters } from "./urls";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, metadata);

const orders_raw_card = {
  id: 1,
  name: "Raw orders data",
  display: "table",
  visualization_settings: {},
  can_write: true,
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

function parseUrl(url: string) {
  const parsed = parse(url, true);
  return {
    card: parsed.hash && deserializeCardFromUrl(parsed.hash),
    query: parsed.query,
    pathname: parsed.pathname,
  };
}

describe("URLs", () => {
  const adhocUrl =
    "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJsaWIvdHlwZSI6Im1icWwvcXVlcnkiLCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9tYnFsIiwic291cmNlLXRhYmxlIjoyfV19LCJkaXNwbGF5IjoidGFibGUiLCJuYW1lIjoiUmF3IG9yZGVycyBkYXRhIiwicGFyYW1ldGVyVmFsdWVzIjp7fSwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e319";

  // Covered a lot in query_builder/actions.spec.js, just very basic cases here
  // (currently getUrl has logic that is strongly tied to the logic query builder Redux actions)
  describe("getUrl(originalQuestion?)", () => {
    it("returns URL with ID for saved question", () => {
      const question = new Question(assoc(orders_raw_card, "id", 1), metadata);
      expect(getQuestionUrl(question)).toBe("/question/1-raw-orders-data");
    });

    it("returns a URL with hash for an unsaved question", () => {
      const question = new Question(dissoc(orders_raw_card, "id"), metadata);
      expect(getQuestionUrl(question)).toBe(adhocUrl);
    });
  });

  it("should avoid generating URLs with transient IDs", () => {
    const question = new Question(
      assoc(orders_raw_card, "id", "foo"),
      metadata,
    );

    expect(getQuestionUrl(question)).toBe(adhocUrl);
  });
});

describe("getQuestionUrlWithParameters", () => {
  const parameters: ParameterWithTarget[] = [
    {
      id: "1",
      name: "String",
      slug: "param_string",
      type: "category",
      target: ["dimension", ["field", 1, null]],
    },
    {
      id: "2",
      name: "Operator",
      slug: "param_operator",
      type: "category/starts-with",
      target: ["dimension", ["field", 2, null]],
    },
    {
      id: "3",
      name: "Date",
      slug: "param_date",
      type: "date/month",
      target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
    },
    {
      id: "4",
      name: "Foreign Key",
      slug: "param_fk",
      type: "date/month",
      target: ["dimension", ["field", 2, { "source-field": 1 }]],
    },
    {
      id: "5",
      name: "Number",
      slug: "param_number",
      type: "number/=",
      target: ["dimension", ["field", 2, null]],
    },
  ];

  const card = {
    id: 1,
    dataset_query: Lib.toJsQuery(
      Lib.fromJsQuery(metadataProvider, {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
        },
        database: SAMPLE_DB_ID,
      }),
    ),
  };

  describe("with structured card", () => {
    const question = new Question(card, metadata);
    const originalQuestion = question;

    it("should return question URL with no parameters", () => {
      const parameters: ParameterWithTarget[] = [];
      const parameterValues = {};

      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        parameterValues,
      );

      expect(parseUrl(url)).toEqual({
        pathname: "/question/1",
        query: {},
        card: null,
      });
    });

    it("should return question URL with string MBQL filter added", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        {
          1: "bar",
        },
      );

      const parsedUrl = parseUrl(url);
      const parsedQuestion = new Question(parsedUrl.card, question.metadata());
      expect(parsedUrl.pathname).toEqual("/question");
      expect(parsedUrl.query).toEqual({});
      expect(Lib.filters(parsedQuestion.query(), -1)).toHaveLength(1);
    });

    it("should return question URL with number MBQL filter added", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        {
          5: 123,
        },
      );

      const parsedUrl = parseUrl(url);
      const parsedQuestion = new Question(parsedUrl.card, question.metadata());
      expect(Lib.filters(parsedQuestion.query(), -1)).toHaveLength(1);
    });

    it("should return question URL with date MBQL filter added", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        {
          3: "2017-05",
        },
      );

      const parsedUrl = parseUrl(url);
      const parsedQuestion = new Question(parsedUrl.card, question.metadata());
      expect(Lib.filters(parsedQuestion.query(), -1)).toHaveLength(1);
    });

    it("should include objectId in a URL", () => {
      const OBJECT_ID = "5";
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        { 1: "bar" },
        { objectId: OBJECT_ID },
      );

      expect(parseUrl(url)).toEqual({
        pathname: "/question",
        query: { objectId: OBJECT_ID },
        card: expect.any(Object),
      });
    });
  });

  describe("with structured question & no permissions", () => {
    const question = new Question(card);
    const originalQuestion = question;

    it("should return a card with attached parameters and parameter values as query params", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        {
          1: "bar",
        },
      );

      const deserializedCard = {
        ...card,
        parameters,
        original_card_id: card.id,
        parameterValues: {},
      };

      // @ts-expect-error: We're removing a required field
      delete deserializedCard.id;

      expect(parseUrl(url)).toEqual({
        pathname: "/question",
        query: {
          param_date: "",
          param_fk: "",
          param_number: "",
          param_operator: "",
          param_string: "bar",
        },
        card: deserializedCard,
      });
    });

    it("should not include objectId in a URL", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        { 1: "bar" },
        { objectId: 5 },
      );

      expect(parseUrl(url).query.objectId).toBeUndefined();
    });
  });

  describe("with a native question", () => {
    const cardWithTextFilter = {
      id: 1,
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          "template-tags": {
            baz: { name: "baz", type: "text", id: "foo" },
          },
        },
      },
    };

    const parametersForNativeQ: ParameterWithTarget[] = [
      {
        ...parameters[0],
        target: ["variable", ["template-tag", "baz"]],
      },
      {
        ...parameters[4],
        target: ["dimension", ["template-tag", "bar"]],
      },
    ];

    const cardWithFieldFilter = {
      id: 2,
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          "template-tags": {
            bar: { name: "bar", type: "number/=", id: "abc" },
          },
        },
      },
    };

    const question = new Question(cardWithTextFilter, metadata);
    const originalQuestion = question;

    it("should return question URL when there are no parameters", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        [],
        {},
      );
      expect(parseUrl(url)).toEqual({
        pathname: "/question/1",
        query: {},
        card: null,
      });
    });

    it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's variable", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parametersForNativeQ,
        {
          1: "bar",
        },
      );

      expect(parseUrl(url)).toEqual({
        pathname: "/question/1",
        query: { baz: "bar" },
        card: null,
      });
    });

    it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's field filter", () => {
      const question = new Question(cardWithFieldFilter, metadata);
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parametersForNativeQ,
        {
          5: "111",
        },
      );

      expect(parseUrl(url)).toEqual({
        pathname: "/question/2",
        query: { bar: "111" },
        card: null,
      });
    });

    it("should not include objectId in a URL", () => {
      const url = getQuestionUrlWithParameters(
        question,
        originalQuestion,
        parametersForNativeQ,
        {
          1: "bar",
        },
      );
      expect(parseUrl(url).query.objectId).toBeUndefined();
    });
  });
});
