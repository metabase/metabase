import { Questions } from "metabase/entities/questions";
import { Tables } from "metabase/entities/tables";
import { convertSavedQuestionToVirtualTable } from "metabase-lib/v1/metadata/utils/saved-questions";

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

  describe("metabase/entities/UPDATE original_fields sync", () => {
    function getEntitiesUpdateAction(fields) {
      return {
        type: "metabase/entities/UPDATE",
        payload: {
          entities: { fields },
          result: Object.keys(fields)[0],
        },
      };
    }

    it("syncs matching original_fields entries when a field is updated", () => {
      const state = {
        1: {
          id: 1,
          original_fields: [
            { id: 10, display_name: "Old" },
            { id: 11, display_name: "Other" },
          ],
        },
      };

      const nextState = Tables.reducer(
        state,
        getEntitiesUpdateAction({
          10: { id: 10, table_id: 1, display_name: "New" },
        }),
      );

      expect(nextState[1].original_fields).toEqual([
        { id: 10, table_id: 1, display_name: "New" },
        { id: 11, display_name: "Other" },
      ]);
    });

    it("leaves state untouched when the table has no original_fields", () => {
      const state = { 1: { id: 1, name: "Orders" } };

      const nextState = Tables.reducer(
        state,
        getEntitiesUpdateAction({
          10: { id: 10, table_id: 1, display_name: "New" },
        }),
      );

      expect(nextState).toBe(state);
    });

    it("leaves state untouched when no original_fields entry matches the updated id", () => {
      const state = {
        1: {
          id: 1,
          original_fields: [{ id: 99, display_name: "Untouched" }],
        },
      };

      const nextState = Tables.reducer(
        state,
        getEntitiesUpdateAction({
          10: { id: 10, table_id: 1, display_name: "New" },
        }),
      );

      expect(nextState).toBe(state);
    });

    it("leaves state untouched when multiple original_fields entries share the updated id", () => {
      // Virtual card tables can map several columns to the same source field —
      // normalization collapses those entries, so we can't tell which one the
      // update belongs to.
      const state = {
        card__1: {
          id: "card__1",
          original_fields: [
            { id: 10, display_name: "First Product ID" },
            { id: 10, display_name: "Second Product ID" },
          ],
        },
      };

      const nextState = Tables.reducer(
        state,
        getEntitiesUpdateAction({
          "card__1:10": { id: 10, table_id: "card__1", display_name: "Both" },
        }),
      );

      expect(nextState).toBe(state);
    });

    it("ignores UPDATE actions flagged with error", () => {
      const state = {
        1: {
          id: 1,
          original_fields: [{ id: 10, display_name: "Old" }],
        },
      };

      const nextState = Tables.reducer(state, {
        type: "metabase/entities/UPDATE",
        error: true,
        payload: {
          entities: {
            fields: { 10: { id: 10, table_id: 1, display_name: "x" } },
          },
        },
      });

      expect(nextState).toBe(state);
    });
  });
});
