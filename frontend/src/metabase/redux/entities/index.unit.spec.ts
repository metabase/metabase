import { reducer } from "./index";

const UPDATE = "metabase/entities/UPDATE";

describe("entities reducer", () => {
  it("initializes every slice to an empty object", () => {
    const state = reducer(undefined, { type: "@@INIT" });

    expect(state).toEqual({
      collections: {},
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
