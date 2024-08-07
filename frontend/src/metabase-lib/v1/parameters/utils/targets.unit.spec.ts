import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import { convertSavedQuestionToVirtualTable } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  getParameterColumns,
  getParameterTargetField,
  getTemplateTagFromTarget,
  isParameterVariableTarget,
} from "metabase-lib/v1/parameters/utils/targets";
import type { ParameterDimensionTarget } from "metabase-types/api";
import {
  createMockParameter,
  createMockSavedQuestionsDatabase,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createSavedStructuredCard,
  createStructuredModelCard,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { isDimensionTarget } from "metabase-types/guards";

const savedQuestionsDb = createMockSavedQuestionsDatabase();

const metadata = createMockMetadata({
  databases: [createSampleDatabase(), savedQuestionsDb],
});

const db = metadata.database(SAMPLE_DB_ID) as Database;

describe("parameters/utils/targets", () => {
  describe("isDimensionTarget", () => {
    it("should return false for non-dimension targets", () => {
      expect(isDimensionTarget(["variable", ["template-tag", "foo"]])).toBe(
        false,
      );
    });

    it('should return true for a target that contains a "dimension" string in the first entry', () => {
      expect(isDimensionTarget(["dimension", ["field", 1, null]])).toBe(true);
      expect(isDimensionTarget(["dimension", ["template-tag", "foo"]])).toBe(
        true,
      );
    });
  });

  describe("isVariableTarget", () => {
    it("should return false for non-variable targets", () => {
      expect(isParameterVariableTarget(["dimension", ["field", 1, null]])).toBe(
        false,
      );
      expect(
        isParameterVariableTarget(["dimension", ["template-tag", "foo"]]),
      ).toBe(false);
    });

    it("should return true for a variable target", () => {
      expect(
        isParameterVariableTarget(["variable", ["template-tag", "foo"]]),
      ).toBe(true);
    });
  });

  describe("getTemplateTagFromTarget", () => {
    it("should return the tag of a template tag target", () => {
      expect(
        getTemplateTagFromTarget(["variable", ["template-tag", "foo"]]),
      ).toBe("foo");
      expect(
        getTemplateTagFromTarget(["dimension", ["template-tag", "bar"]]),
      ).toBe("bar");
    });

    it("should return null for targets that are not template tags", () => {
      expect(
        getTemplateTagFromTarget(["dimension", ["field", 123, null]]),
      ).toBe(null);
    });
  });

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where CATEGORY = {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "text",
          }),
        },
      });
      const parameter = createMockParameter();

      expect(
        getParameterTargetField(question, parameter, [
          "variable",
          ["template-tag", "foo"],
        ]),
      ).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target: ParameterDimensionTarget = [
        "dimension",
        ["template-tag", "foo"],
      ];
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
          }),
        },
      });
      const parameter = createMockParameter();

      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });

    it("should return the target field", () => {
      const question = db.question({
        "source-table": PRODUCTS_ID,
      });
      const parameter = createMockParameter();
      const target: ParameterDimensionTarget = [
        "dimension",
        ["field", PRODUCTS.CATEGORY, null],
      ];
      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });
  });

  describe("getParameterColumns", () => {
    it("question - returns columns from source table and implicitly joinable tables", () => {
      const card = createSavedStructuredCard();
      const question = new Question(card, metadata);
      const { query, stageIndex, columns } = getParameterColumns(question);
      const columnsInfos = columns.map(column => {
        return Lib.displayInfo(query, stageIndex, column);
      });

      expect(columnsInfos).toHaveLength(30);
      expect(columnsInfos[0]).toMatchObject({
        table: { displayName: "Orders" },
        longDisplayName: "Created At",
      });
      expect(columnsInfos[9]).toMatchObject({
        table: { displayName: "Products" },
        longDisplayName: "Product → Category",
      });
      expect(columnsInfos[17]).toMatchObject({
        table: { displayName: "People" },
        longDisplayName: "User → Address",
      });
    });

    it("model - returns columns from source table and implicitly joinable tables", () => {
      const card = createStructuredModelCard();
      const metadata = createMockMetadata({
        databases: [createSampleDatabase(), savedQuestionsDb],
        tables: [convertSavedQuestionToVirtualTable(card)],
        questions: [card],
      });
      const question = new Question(card, metadata);
      const { query, stageIndex, columns } = getParameterColumns(question);
      const columnsInfos = columns.map(column => {
        return Lib.displayInfo(query, stageIndex, column);
      });

      // TODO: columnsInfos length is 0
      expect(columnsInfos).toHaveLength(30);
      // TODO: update assertions
      expect(columnsInfos[0]).toMatchObject({
        table: { displayName: "Orders" },
        longDisplayName: "Created At",
      });
      expect(columnsInfos[9]).toMatchObject({
        table: { displayName: "Products" },
        longDisplayName: "Product → Category",
      });
      expect(columnsInfos[17]).toMatchObject({
        table: { displayName: "People" },
        longDisplayName: "User → Address",
      });
    });
  });
});
