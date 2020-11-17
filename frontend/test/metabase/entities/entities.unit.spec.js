import { createEntity, combineEntities } from "metabase/lib/entities";
import requestsReducer from "metabase/redux/requests";
import { combineReducers, applyMiddleware, createStore, compose } from "redux";

import promise from "redux-promise";
import { thunkWithDispatchAction } from "metabase/store";

const widgets = createEntity({
  name: "widgets",
  api: {
    get: ({ id }) => ({ id: id, name: "object" + id }),
  },
});

const entities = combineEntities([widgets]);

const reducer = combineReducers({
  entities: entities.reducer,
  requests: (state, action) =>
    requestsReducer(entities.requestsReducer(state, action), action),
});

const initialState = {
  entities: {
    widgets: {
      1: { name: "foo " },
      2: { name: "bar" },
    },
  },
};

describe("entities", () => {
  let store;
  beforeEach(() => {
    store = createStore(
      reducer,
      initialState,
      compose(applyMiddleware(thunkWithDispatchAction, promise)),
    );
  });
  describe("getObject", () => {
    it("should return an object", () => {
      expect(
        widgets.selectors.getObject(initialState, { entityId: 1 }),
      ).toEqual({ name: "foo " });
    });
    it("should cache the object", () => {
      const a1 = widgets.selectors.getObject(initialState, { entityId: 1 });
      const a2 = widgets.selectors.getObject(initialState, { entityId: 1 });
      expect(a1).toBe(a2);
    });
    it("should cache multiple objects", () => {
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
      await store.dispatch(widgets.actions.fetch({ id: 3 }));
      const object = widgets.selectors.getObject(store.getState(), {
        entityId: 3,
      });
      expect(object).toEqual({ id: 3, name: "object3" });
    });
  });
});
