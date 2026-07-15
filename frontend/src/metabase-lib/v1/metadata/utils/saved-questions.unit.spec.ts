import type { Collection } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockModerationReview,
} from "metabase-types/api/mocks";

import {
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaId,
  getCollectionVirtualSchemaName,
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
  isVirtualCardId,
} from "./saved-questions";

describe("saved question helpers", () => {
  describe("getCollectionVirtualSchemaName", () => {
    it("should return 'Everything else' for root collection", () => {
      expect(getCollectionVirtualSchemaName(null)).toBe("Everything else");
      expect(
        getCollectionVirtualSchemaName({ id: "root", name: "Our analytics" }),
      ).toBe("Everything else");
    });

    it("should return 'Everything else' if collection is not passed", () => {
      expect(getCollectionVirtualSchemaName()).toBe("Everything else");
    });

    it("should return collection name for normal collections", () => {
      expect(
        getCollectionVirtualSchemaName({ id: 23, name: "Important questions" }),
      ).toBe("Important questions");
    });

    it("should prefer collection's schema name over just name", () => {
      const collection = {
        id: 5,
        name: "Your personal collection",
        schemaName: "John Doe's Personal collection",
      };
      expect(getCollectionVirtualSchemaName(collection)).toBe(
        collection.schemaName,
      );
    });
  });

  describe("getCollectionVirtualSchemaId", () => {
    [
      {
        collection: undefined,
        expectedName: encodeURIComponent("Everything else"),
      },
      {
        collection: null,
        expectedName: encodeURIComponent("Everything else"),
      },
      {
        collection: { id: "root" as const, name: "Our analytics" },
        expectedName: encodeURIComponent("Everything else"),
      },
      { collection: { id: 3, name: "Marketing" }, expectedName: "Marketing" },
    ].forEach(({ collection, expectedName }) => {
      it("returns name prefixed with virtual saved question DB ID", () => {
        expect(getCollectionVirtualSchemaId(collection)).toBe(
          `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:${expectedName}`,
        );
      });
    });

    it("should return correct schema for collection models", () => {
      const collection = { id: 1, name: "Marketing" };
      const expectedId = `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:Marketing`;

      expect(getCollectionVirtualSchemaId(collection)).toBe(expectedId);
    });
  });

  describe("getQuestionVirtualTableId", () => {
    it("returns question prefixed question ID", () => {
      expect(getQuestionVirtualTableId(7)).toBe("card__7");
    });
  });

  describe("isVirtualCardId", () => {
    it("should return true for virtual table ID", () => {
      expect(isVirtualCardId("card__4")).toBe(true);
    });

    it("should return false for normal table ID", () => {
      expect(isVirtualCardId(4)).toBe(false);
    });

    it("should return false for non-virtual ids", () => {
      expect(isVirtualCardId()).toBe(false);
      expect(isVirtualCardId(null)).toBe(false);
      expect(isVirtualCardId(0)).toBe(false);
      expect(isVirtualCardId(-1)).toBe(false);
      expect(isVirtualCardId("1")).toBe(false);
    });

    it("should return false for card__ ids without a numeric card id", () => {
      expect(isVirtualCardId("card__")).toBe(false);
      expect(isVirtualCardId("card__abc")).toBe(false);
    });
  });

  describe("getQuestionIdFromVirtualTableId", () => {
    [
      { tableId: "card__1", cardId: 1 },
      { tableId: "card__234", cardId: 234 },
    ].forEach((testCase) => {
      const { tableId, cardId } = testCase;

      it(`should extract ID from virtual ID (${tableId})`, () => {
        expect(getQuestionIdFromVirtualTableId(tableId)).toBe(cardId);
      });
    });

    [{ id: undefined }, { id: null }, { id: 123 }].forEach((testCase) => {
      const { id } = testCase;

      it(`should handle non string input (${id})`, () => {
        expect(getQuestionIdFromVirtualTableId(id)).toBe(null);
      });
    });

    ["card__", "card__test"].forEach((id) => {
      it(`should handle invalid ID ${id}`, () => {
        expect(getQuestionIdFromVirtualTableId(id)).toBe(null);
      });
    });
  });

  describe("convertSavedQuestionToVirtualTable", () => {
    const createTestCard = (collection: Collection | null) =>
      createMockCard({
        id: 11,
        name: "Q1",
        description: "Text",
        database_id: 4,
        moderation_reviews: [
          createMockModerationReview({ status: "verified" }),
        ],
        collection,
      });

    it("correctly converts questions in normal collections", () => {
      const question = createTestCard(
        createMockCollection({ id: 8, name: "Marketing" }),
      );

      expect(convertSavedQuestionToVirtualTable(question)).toEqual({
        id: `card__${question.id}`,
        display_name: question.name,
        description: question.description,
        moderated_status: "verified",
        db_id: question.database_id,
        type: "question",
        schema: `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:Marketing`,
        schema_name: "Marketing",
      });
    });

    it("correctly converts questions in the root collection", () => {
      const question = createTestCard(null);

      expect(convertSavedQuestionToVirtualTable(question)).toEqual({
        id: `card__${question.id}`,
        display_name: question.name,
        description: question.description,
        moderated_status: "verified",
        db_id: question.database_id,
        type: "question",
        schema: `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:${encodeURIComponent(
          "Everything else",
        )}`,
        schema_name: "Everything else",
      });
    });
  });
});
