import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { requestsReducer } from "metabase/redux/requests";

import { combineEntities, createEntity, mergeEntities } from "./entities";

function getObject(id: number) {
  return { id: id, name: `object${id}` };
}

function setup() {
  const widgets = createEntity({
    name: "widgets",
    api: {
      get: jest
        .fn()
        .mockImplementation(({ id }: { id: number }) => getObject(id)),
      list: jest.fn().mockImplementation(() => [getObject(1), getObject(2)]),
    },
  });

  const entities = combineEntities([widgets]);

  const reducer = combineReducers({
    entities: entities.reducer,
    requests: (
      state: Record<string, unknown> | undefined,
      action: { type: string; payload: Record<string, unknown> | undefined },
    ) => requestsReducer(entities.requestsReducer(state, action), action),
  });

  const initialState = {
    entities: {
      widgets: {
        1: { name: "foo " },
        2: { name: "bar" },
      },
    },
  };

  const store = configureStore({
    reducer,
    preloadedState: initialState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }),
  });

  return { widgets, store, initialState };
}

describe("entities", () => {
  describe("getObject", () => {
    it("should return an object", () => {
      const { widgets, initialState } = setup();
      expect(
        widgets.selectors.getObject(initialState, { entityId: 1 }),
      ).toEqual({ name: "foo " });
    });

    it("should cache the object", () => {
      const { widgets, initialState } = setup();
      const a1 = widgets.selectors.getObject(initialState, { entityId: 1 });
      const a2 = widgets.selectors.getObject(initialState, { entityId: 1 });
      expect(a1).toBe(a2);
    });

    it("should cache multiple objects", () => {
      const { widgets, initialState } = setup();
      const a1 = widgets.selectors.getObject(initialState, { entityId: 1 });
      const b1 = widgets.selectors.getObject(initialState, { entityId: 2 });
      const a2 = widgets.selectors.getObject(initialState, { entityId: 1 });
      const b2 = widgets.selectors.getObject(initialState, { entityId: 2 });
      expect(a1).toBe(a2);
      expect(b1).toBe(b2);
    });
  });

  describe("fetch", () => {
    it("should fetch an entity", async () => {
      const { widgets, store } = setup();
      await store.dispatch(widgets.actions.fetch({ id: 3 }));
      const object = widgets.selectors.getObject(store.getState(), {
        entityId: 3,
      });
      expect(object).toEqual(getObject(3));
    });
  });

  describe("fetchList", () => {
    it("should fetch a list of entities", async () => {
      const { widgets, store } = setup();
      await store.dispatch(widgets.actions.fetchList());
      const objects = widgets.selectors.getList(store.getState());
      expect(objects).toEqual([getObject(1), getObject(2)]);
    });

    it("should not call the API when the results are cached", async () => {
      const { widgets, store } = setup();
      await store.dispatch(widgets.actions.fetchList());
      expect(widgets.api.list).toHaveBeenCalledTimes(1);

      await store.dispatch(widgets.actions.fetchList());
      expect(widgets.api.list).toHaveBeenCalledTimes(1);

      await store.dispatch(widgets.actions.fetchList({ query: "abc" }));
      expect(widgets.api.list).toHaveBeenCalledTimes(2);

      await store.dispatch(widgets.actions.fetchList({ query: "abc" }));
      expect(widgets.api.list).toHaveBeenCalledTimes(2);

      await store.dispatch(widgets.actions.fetchList());
      expect(widgets.api.list).toHaveBeenCalledTimes(2);
    });
  });

  describe("mergeEntities", () => {
    it("add an entity", () => {
      expect(
        mergeEntities(
          { actions: { id: 1, name: "foo" } },
          { questions: { id: 2, name: "bar" } },
        ),
      ).toEqual({ 1: { id: 1, name: "foo" }, 2: { id: 2, name: "bar" } });
    });

    it("merge entity keys", () => {
      expect(
        mergeEntities(
          { actions: { id: 1, name: "foo", prop1: 123 } },
          { actions: { id: 1, name: "bar", prop2: 456 } },
        ),
      ).toEqual({ actions: { id: 1, name: "bar", prop1: 123, prop2: 456 } });
    });

    it("delete an entity", () => {
      expect(
        mergeEntities(
          { databases: { id: 1 }, questions: { id: 2 } },
          { dashboards: undefined },
        ),
      ).toEqual({ databases: { id: 1 } });
    });
  });
});
