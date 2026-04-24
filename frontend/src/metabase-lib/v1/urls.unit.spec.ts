import { parse } from "url";

import { createMockMetadata } from "__support__/metadata";
// eslint-disable-next-line no-restricted-imports
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import * as Lib from "metabase-lib";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import Question from "./Question";
import type { ParameterWithTarget } from "./parameters/types";
import { getStructuredQuestionUrlWithParameters } from "./urls";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, metadata);

function parseUrl(url: string) {
  const parsed = parse(url, true);
  return {
    card: parsed.hash && deserializeCardFromUrl(parsed.hash),
    query: parsed.query,
    pathname: parsed.pathname,
  };
}

describe("getStructuredQuestionUrlWithParameters", () => {
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

      const url = getStructuredQuestionUrlWithParameters(
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
      const url = getStructuredQuestionUrlWithParameters(
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
      const url = getStructuredQuestionUrlWithParameters(
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
      const url = getStructuredQuestionUrlWithParameters(
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
      const url = getStructuredQuestionUrlWithParameters(
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
      const url = getStructuredQuestionUrlWithParameters(
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
      const url = getStructuredQuestionUrlWithParameters(
        question,
        originalQuestion,
        parameters,
        { 1: "bar" },
        { objectId: 5 },
      );

      expect(parseUrl(url).query.objectId).toBeUndefined();
    });
  });
});
