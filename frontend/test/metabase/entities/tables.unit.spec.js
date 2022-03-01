import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";
import { convertSavedQuestionToVirtualTable } from "metabase/lib/saved-questions";

describe("table entity", () => {
  describe("saved questions | reducer", () => {
    function getQuestion({
      id = 5,
      name = "Q1",
      collection = null,
      dataset_query = { database: 1 },
      archived = false,
    } = {}) {
      const question = {
        id,
        name,
        collection,
        dataset_query,
        archived,
      };
      return {
        question,
        virtualTable: convertSavedQuestionToVirtualTable(question),
      };
    }

    function getCreateAction(question) {
      return {
        type: Questions.actionTypes.CREATE,
        payload: {
          question,
          object: question,
        },
      };
    }

    function getUpdateAction(question) {
      return {
        type: Questions.actionTypes.UPDATE,
        payload: {
          question,
          object: question,
        },
      };
    }

    it("should add saved question to tables state", () => {
      const { question, virtualTable } = getQuestion();

      const nextState = Tables.reducer({}, getCreateAction(question));

      expect(nextState).toEqual({
        [virtualTable.id]: virtualTable,
      });
    });

    it("should remove saved question from state when archived", () => {
      const { question, virtualTable } = getQuestion({ archived: true });

      const nextState = Tables.reducer(
        {
          card__123: { foo: "bar" },
          [virtualTable.id]: virtualTable,
        },
        getUpdateAction(question),
      );

      expect(nextState).toEqual({ card__123: { foo: "bar" } });
    });

    it("should add saved question to tables state when unarchived", () => {
      const { question, virtualTable } = getQuestion();

      const nextState = Tables.reducer({}, getUpdateAction(question));

      expect(nextState).toEqual({
        [virtualTable.id]: virtualTable,
      });
    });
  });
});
