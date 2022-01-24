import Question from "metabase-lib/lib/Question";
import Database from "metabase-lib/lib/metadata/Database";
import {
  TemplateTag,
  TemplateTagType,
  TemplateTags,
} from "metabase-types/types/Query";
import { createMockDatabase } from "metabase-types/api/mocks/database";
import { ORDERS, metadata } from "__support__/sample_database_fixture";
import { checkCanBeModel } from "./utils";

function getNativeQuestion(tags: TemplateTags = {}) {
  const question = new Question(
    {
      id: 1,
      display: "table",
      can_write: true,
      public_uuid: "",
      dataset_query: {
        type: "native",
        database: 1,
        native: {
          query: "select * from orders",
          "template-tags": tags,
        },
      },
      visualization_settings: {},
    },
    metadata,
  );
  return question;
}

function getTemplateTag(tag: Partial<TemplateTag> = {}): TemplateTag {
  return {
    id: "_",
    name: "_",
    "display-name": "_",
    type: "card",
    ...tag,
  };
}

describe("data model utils", () => {
  const DB_WITHOUT_NESTED_QUERIES_SUPPORT = new Database({
    ...createMockDatabase(),
    features: [],
  });

  describe("checkCanBeModel", () => {
    const UNSUPPORTED_TEMPLATE_TAG_TYPES: TemplateTagType[] = [
      "text",
      "number",
      "date",
      "dimension",
    ];

    describe("structured queries", () => {
      it("returns true for regular questions", () => {
        const question = ORDERS.question();
        expect(checkCanBeModel(question)).toBe(true);
      });

      it("returns false if database does not support nested queries", () => {
        const question = ORDERS.question();
        question.query().database = () => DB_WITHOUT_NESTED_QUERIES_SUPPORT;
        expect(checkCanBeModel(question)).toBe(false);
      });
    });

    describe("native queries", () => {
      it("returns true if no variables used", () => {
        const question = getNativeQuestion();
        expect(checkCanBeModel(question)).toBe(true);
      });

      it("returns false if database does not support nested queries", () => {
        const question = getNativeQuestion();
        question.query().database = () => DB_WITHOUT_NESTED_QUERIES_SUPPORT;

        expect(checkCanBeModel(question)).toBe(false);
      });
      it("returns true when 'card' variables are used", () => {
        const question = getNativeQuestion({
          "#5": getTemplateTag({ type: "card" }),
        });
        expect(checkCanBeModel(question)).toBe(true);
      });

      UNSUPPORTED_TEMPLATE_TAG_TYPES.forEach(tagType => {
        it(`returns false when '${tagType}' variables are used`, () => {
          const question = getNativeQuestion({
            foo: getTemplateTag({ type: tagType }),
          });
          expect(checkCanBeModel(question)).toBe(false);
        });
      });

      it("returns false if at least one unsupported variable type is used", () => {
        const question = getNativeQuestion({
          "#5": getTemplateTag({ type: "card" }),
          foo: getTemplateTag({ type: "dimension" }),
        });
        expect(checkCanBeModel(question)).toBe(false);
      });
    });
  });
});
