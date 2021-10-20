import {
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  getCollectionVirtualSchemaId,
  getCollectionVirtualSchemaName,
  getQuestionVirtualTableId,
  convertSavedQuestionToVirtualTable,
} from "./saved-questions";

describe("saved question helpers", () => {
  describe("getCollectionVirtualSchemaName", () => {
    it("should return 'Everything else' for root collection", () => {
      expect(getCollectionVirtualSchemaName({ id: null })).toBe(
        "Everything else",
      );
    });

    it("should return 'Everything else' if collection is not passed", () => {
      expect(getCollectionVirtualSchemaName()).toBe("Everything else");
    });

    it("should return collection name for normal collections", () => {
      expect(
        getCollectionVirtualSchemaName({ id: 23, name: "Important questions" }),
      ).toBe("Important questions");
    });
  });

  describe("getCollectionVirtualSchemaId", () => {
    [
      { collection: undefined, expectedName: "Everything else" },
      { collection: { id: null }, expectedName: "Everything else" },
      { collection: { id: 3, name: "Marketing" }, expectedName: "Marketing" },
    ].forEach(({ collection, expectedName }) => {
      it("returns name prefixed with virtual saved question DB ID", () => {
        expect(getCollectionVirtualSchemaId(collection)).toBe(
          `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:${expectedName}`,
        );
      });
    });
  });

  describe("getQuestionVirtualTableId", () => {
    it("returns question prefixed question ID", () => {
      expect(getQuestionVirtualTableId({ id: 7 })).toBe("card__7");
    });
  });

  describe("convertSavedQuestionToVirtualTable", () => {
    const COMMON_QUESTION_DATA = {
      id: 11,
      name: "Q1",
      description: "Text",
      moderated_status: "verified",
      dataset_query: {
        database: 4,
      },
    };

    it("correctly converts questions in normal collections", () => {
      const question = {
        ...COMMON_QUESTION_DATA,
        collection: {
          id: 8,
          name: "Marketing",
        },
      };

      expect(convertSavedQuestionToVirtualTable(question)).toEqual({
        id: `card__${question.id}`,
        display_name: question.name,
        description: question.description,
        moderated_status: question.moderated_status,
        db_id: question.dataset_query.database,
        schema: `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:${question.collection.name}`,
        schema_name: question.collection.name,
      });
    });

    it("correctly converts questions in the root collection", () => {
      const question = {
        ...COMMON_QUESTION_DATA,
        collection: null,
      };

      expect(convertSavedQuestionToVirtualTable(question)).toEqual({
        id: `card__${question.id}`,
        display_name: question.name,
        description: question.description,
        moderated_status: question.moderated_status,
        db_id: question.dataset_query.database,
        schema: `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:Everything else`,
        schema_name: "Everything else",
      });
    });
  });
});
