import Question from "metabase-lib/lib/Question";
import {
  TemplateTag,
  TemplateTagType,
  TemplateTags,
} from "metabase-types/types/Query";
import { ORDERS } from "__support__/sample_database_fixture";
import { checkCanBeModel } from "./utils";

function getNativeQuestion(tags: TemplateTags = {}) {
  return new Question({
    id: 1,
    display: "table",
    can_write: true,
    public_uuid: "",
    dataset_query: {
      type: "native",
      native: {
        query: "select * from orders",
        "template-tags": tags,
      },
    },
    visualization_settings: {},
  });
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
  describe("checkCanBeModel", () => {
    const UNSUPPORTED_TEMPLATE_TAG_TYPES: TemplateTagType[] = [
      "text",
      "number",
      "date",
      "dimension",
    ];

    it("returns true for structured queries", () => {
      const question = ORDERS.question();
      expect(checkCanBeModel(question)).toBe(true);
    });

    it("returns true for native queries without variables", () => {
      const question = getNativeQuestion();
      expect(checkCanBeModel(question)).toBe(true);
    });

    it("returns true for native queries with 'card' variables", () => {
      const question = getNativeQuestion({
        "#5": getTemplateTag({ type: "card" }),
      });
      expect(checkCanBeModel(question)).toBe(true);
    });

    UNSUPPORTED_TEMPLATE_TAG_TYPES.forEach(tagType => {
      it(`returns false false for native queries with '${tagType}' variables`, () => {
        const question = getNativeQuestion({
          foo: getTemplateTag({ type: tagType }),
        });
        expect(checkCanBeModel(question)).toBe(false);
      });
    });

    it("returns false for native queries if it uses at least one unsupported variable type", () => {
      const question = getNativeQuestion({
        "#5": getTemplateTag({ type: "card" }),
        foo: getTemplateTag({ type: "dimension" }),
      });
      expect(checkCanBeModel(question)).toBe(false);
    });
  });
});
