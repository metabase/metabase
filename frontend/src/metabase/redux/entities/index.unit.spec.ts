import { updateMetadata } from "metabase/redux/metadata";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import { DatabaseSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { reducer } from "./index";

const UPDATE = "metabase/entities/UPDATE";

describe("entities reducer", () => {
  it("initializes every slice to an empty object", () => {
    const state = reducer(undefined, { type: "@@INIT" });

    expect(state).toEqual({
      dashboards: {},
      databases: {},
      fields: {},
      measures: {},
      metrics: {},
      questions: {},
      schemas: {},
      segments: {},
      snippets: {},
      tables: {},
    });
  });

  describe(UPDATE, () => {
    it("writes new entries into the matching slice", () => {
      const state = reducer(undefined, {
        type: UPDATE,
        payload: {
          entities: {
            databases: { 1: { id: 1, name: "DB" } },
          },
        },
      });

      expect(state.databases).toEqual({ 1: { id: 1, name: "DB" } });
    });

    it("shallow-merges partial entries so existing fields are preserved", () => {
      const initial = reducer(undefined, {
        type: UPDATE,
        payload: {
          entities: {
            fields: { 7: { id: 7, name: "Full", base_type: "type/Text" } },
          },
        },
      });

      const next = reducer(initial, {
        type: UPDATE,
        payload: {
          entities: {
            fields: { 7: { id: 7, semantic_type: "type/Category" } },
          },
        },
      });

      expect(next.fields[7]).toEqual({
        id: 7,
        name: "Full",
        base_type: "type/Text",
        semantic_type: "type/Category",
      });
    });

    it("deletes entries whose payload value is nullish", () => {
      const initial = reducer(undefined, {
        type: UPDATE,
        payload: {
          entities: {
            tables: { 1: { id: 1, name: "Keep" }, 2: { id: 2, name: "Drop" } },
          },
        },
      });

      const next = reducer(initial, {
        type: UPDATE,
        payload: { entities: { tables: { 2: null } } },
      });

      expect(next.tables).toEqual({ 1: { id: 1, name: "Keep" } });
    });

    it("merges into multiple slices from a single action", () => {
      const next = reducer(undefined, {
        type: UPDATE,
        payload: {
          entities: {
            databases: { 1: { id: 1 } },
            tables: { 2: { id: 2 } },
            fields: { 3: { id: 3 } },
          },
        },
      });

      expect(next.databases).toEqual({ 1: { id: 1 } });
      expect(next.tables).toEqual({ 2: { id: 2 } });
      expect(next.fields).toEqual({ 3: { id: 3 } });
    });

    describe("reference stability across data-equal updates (metabase#50309)", () => {
      const databasePayload = () => ({
        entities: {
          databases: {
            1: {
              id: 1,
              name: "Big DB",
              initial_sync_status: "incomplete",
              features: ["basic-aggregations"],
              settings: { "database-enable-actions": false },
            },
          },
        },
      });

      it("keeps the state identity when a data-equal payload is merged again", () => {
        const initial = reducer(undefined, {
          type: UPDATE,
          payload: databasePayload(),
        });

        // A sync-status poll re-dispatches an equal (but not identical) payload
        const next = reducer(initial, {
          type: UPDATE,
          payload: databasePayload(),
        });

        expect(next).toBe(initial);
      });

      it("keeps untouched entry references when another entry changes", () => {
        const initial = reducer(undefined, {
          type: UPDATE,
          payload: {
            entities: {
              databases: {
                1: { id: 1, name: "Stable" },
                2: {
                  id: 2,
                  name: "Syncing",
                  initial_sync_status: "incomplete",
                },
              },
            },
          },
        });

        const next = reducer(initial, {
          type: UPDATE,
          payload: {
            entities: {
              databases: {
                1: { id: 1, name: "Stable" },
                2: { id: 2, name: "Syncing", initial_sync_status: "complete" },
              },
            },
          },
        });

        expect(next.databases[1]).toBe(initial.databases[1]);
        expect(next.databases[2]).not.toBe(initial.databases[2]);
      });

      it("keeps the state identity when deleting an entry that does not exist", () => {
        const initial = reducer(undefined, {
          type: UPDATE,
          payload: { entities: { databases: { 1: { id: 1 } } } },
        });

        const next = reducer(initial, {
          type: UPDATE,
          payload: { entities: { databases: { 999: null } } },
        });

        expect(next).toBe(initial);
      });
    });

    it("ignores slices that are not part of the entities map", () => {
      const next = reducer(undefined, {
        type: UPDATE,
        payload: { entities: { unknownSlice: { 1: { id: 1 } } } },
      });

      expect(next).not.toHaveProperty("unknownSlice");
    });
  });

  it("ignores actions outside the metabase/entities/* namespace", () => {
    const initial = reducer(undefined, {
      type: UPDATE,
      payload: { entities: { databases: { 1: { id: 1, name: "DB" } } } },
    });

    const next = reducer(initial, {
      type: "metabase/other/UPDATE",
      payload: { entities: { databases: { 1: { id: 1, name: "Renamed" } } } },
    });

    expect(next.databases).toBe(initial.databases);
  });

  describe("getMetadata stability across polls (metabase#50309)", () => {
    it("does not invalidate getMetadata when a poll returns unchanged data", () => {
      // The database status indicator polls /api/database every 2s while a
      // sync is in progress, and each fulfilled poll re-hydrates the entities
      // store via updateMetadata. Unchanged data must not produce a new
      // Metadata identity — that re-renders every chart and hides tooltips.
      const database = createMockDatabase({
        id: 1,
        initial_sync_status: "incomplete",
      });

      const hydrate = (state: State, response: Database): State => ({
        ...state,
        // The runtime reducer here is the exact reducer behind
        // `state.entities` in the real store; its SliceState typing is looser
        // than EntitiesState (see the FIXMEs in the reducer itself).
        entities: reducer(
          state.entities,
          updateMetadata([response], [DatabaseSchema]),
        ) as State["entities"],
      });

      const stateAfterFirstPoll = hydrate(createMockState(), database);
      const stateAfterSecondPoll = hydrate(
        stateAfterFirstPoll,
        createMockDatabase(database),
      );

      expect(stateAfterSecondPoll.entities).toBe(stateAfterFirstPoll.entities);
      expect(getMetadata(stateAfterSecondPoll)).toBe(
        getMetadata(stateAfterFirstPoll),
      );
    });
  });

  describe("custom slice reducers", () => {
    it("runs the tables custom reducer after merging entities", () => {
      const seeded = reducer(undefined, {
        type: UPDATE,
        payload: {
          entities: {
            tables: {
              5: { id: 5, original_fields: [{ id: 100, name: "Old" }] },
            },
          },
        },
      });

      const next = reducer(seeded, {
        type: UPDATE,
        payload: {
          entities: {
            fields: { 100: { id: 100, table_id: 5, name: "New" } },
          },
        },
      });

      expect(next.tables[5]).toMatchObject({
        original_fields: [{ id: 100, name: "New" }],
      });
    });
  });
});
