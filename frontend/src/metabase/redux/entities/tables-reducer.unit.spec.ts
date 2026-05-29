import { cardCreated, cardUpdated } from "metabase/redux/cards";
import { convertSavedQuestionToVirtualTable } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card } from "metabase-types/api";

import { tablesReducer } from "./tables-reducer";

describe("tablesReducer", () => {
  describe("saved questions virtual table sync", () => {
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

    function getCreateAction(question: unknown) {
      return cardCreated(question as Card);
    }

    function getUpdateAction(question: unknown) {
      return cardUpdated(question as Card);
    }

    it("should add saved question to tables state on CREATE", () => {
      const { question, virtualTable } = getQuestion();

      const nextState = tablesReducer({}, getCreateAction(question));

      expect(nextState).toEqual({
        [virtualTable.id]: virtualTable,
      });
    });

    it("should leave state untouched on CREATE when the virtual table already exists", () => {
      const { question, virtualTable } = getQuestion();
      const state = { [virtualTable.id]: virtualTable };

      const nextState = tablesReducer(state, getCreateAction(question));

      expect(nextState).toBe(state);
    });

    it("should ignore CREATE actions flagged with error", () => {
      const { question } = getQuestion();

      const nextState = tablesReducer(
        {},
        { ...getCreateAction(question), error: true },
      );

      expect(nextState).toEqual({});
    });

    it("should remove saved question from state when archived", () => {
      const { question, virtualTable } = getQuestion({ archived: true });

      const nextState = tablesReducer(
        {
          card__123: { foo: "bar" },
          [virtualTable.id]: virtualTable,
        },
        getUpdateAction(question),
      );

      expect(nextState).toEqual({ card__123: { foo: "bar" } });
    });

    it("should not mutate the previous state when removing an archived question", () => {
      const { question, virtualTable } = getQuestion({ archived: true });
      const state = {
        card__123: { foo: "bar" },
        [virtualTable.id]: virtualTable,
      };

      const nextState = tablesReducer(state, getUpdateAction(question));

      expect(nextState).not.toBe(state);
      expect(state[virtualTable.id]).toBeDefined();
    });

    it("should add saved question to tables state when unarchived", () => {
      const { question, virtualTable } = getQuestion();

      const nextState = tablesReducer({}, getUpdateAction(question));

      expect(nextState).toEqual({
        [virtualTable.id]: virtualTable,
      });
    });

    it("should sync display_name and description into an existing virtual table on UPDATE", () => {
      const { question, virtualTable } = getQuestion();
      const state = { [virtualTable.id]: virtualTable };

      const renamed = { ...question, name: "Renamed", description: "Now here" };
      const nextState = tablesReducer(state, getUpdateAction(renamed));

      expect(nextState[virtualTable.id]).toMatchObject({
        display_name: "Renamed",
        description: "Now here",
      });
    });

    it("should leave state untouched on UPDATE when nothing relevant changed", () => {
      const { question, virtualTable } = getQuestion();
      const state = { [virtualTable.id]: virtualTable };

      const nextState = tablesReducer(state, getUpdateAction(question));

      expect(nextState).toBe(state);
    });

    it("should ignore UPDATE actions flagged with error", () => {
      const { question, virtualTable } = getQuestion({ archived: true });
      const state = { [virtualTable.id]: virtualTable };

      const nextState = tablesReducer(state, {
        ...getUpdateAction(question),
        error: true,
      });

      expect(nextState).toBe(state);
    });
  });

  describe("metabase/entities/UPDATE original_fields sync", () => {
    function getEntitiesUpdateAction(fields: Record<string, unknown>) {
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

      const nextState = tablesReducer(
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

      const nextState = tablesReducer(
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

      const nextState = tablesReducer(
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

      const nextState = tablesReducer(
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

      const nextState = tablesReducer(state, {
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
