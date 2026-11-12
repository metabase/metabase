import { tablesReducer } from "./tables-reducer";

describe("tablesReducer", () => {
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

    it("skips a field written as null, which is a delete", () => {
      const state = {
        1: {
          id: 1,
          original_fields: [{ id: 10, display_name: "Old" }],
        },
      };

      const nextState = tablesReducer(
        state,
        getEntitiesUpdateAction({ 10: null }),
      );

      expect(nextState).toBe(state);
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
      const state = {
        1: {
          id: 1,
          original_fields: [
            { id: 10, display_name: "First Product ID" },
            { id: 10, display_name: "Second Product ID" },
          ],
        },
      };

      const nextState = tablesReducer(
        state,
        getEntitiesUpdateAction({
          10: { id: 10, table_id: 1, display_name: "Both" },
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
