import { configureStore } from "@reduxjs/toolkit";
import { createMemoryHistory } from "history";

import {
  goBack,
  push,
  replace,
  routerMiddleware,
  routing,
  syncHistoryWithStore,
} from "metabase/router";
import { getLocation } from "metabase/selectors/routing";

// Keystone characterization test for the navigation TRANSPORT seam.
//
// `metabase/router` owns the `push`/`replace`/`goBack`
// action creators + `routerMiddleware` + `routing` reducer +
// `syncHistoryWithStore`. This test pins the observable contract that the
// replacement preserves byte-for-byte:
//
//   dispatch(push/replace/goBack)  ->  state.routing  +  @@router/LOCATION_CHANGE
//
// It wires up the SAME transport `store.js` / `app.js` use (the router
// middleware + the routing reducer + a memory history + syncHistoryWithStore),
// isolated from the rest of the app graph.

const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";

const setup = () => {
  const actions: Array<{ type: string; payload?: any }> = [];
  const recorder = () => (next: any) => (action: any) => {
    actions.push(action);
    return next(action);
  };

  const history = createMemoryHistory();
  const store = configureStore({
    reducer: { routing },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }).concat(routerMiddleware(history), recorder),
  });
  const syncedHistory = syncHistoryWithStore(history, store);

  const locationChanges = () =>
    actions.filter((a) => a.type === LOCATION_CHANGE);
  // Unjustified type cast. FIXME
  const location = () => getLocation(store.getState() as any);

  return { store, history: syncedHistory, location, locationChanges };
};

describe("routing transport contract", () => {
  it("mirrors the initial location into state.routing on sync", () => {
    const { location } = setup();
    expect(location().pathname).toBe("/");
  });

  it("push(string) updates pathname, search and hash", () => {
    const { store, location } = setup();

    store.dispatch(push("/question/42?x=1#hash"));

    expect(location().pathname).toBe("/question/42");
    expect(location().search).toBe("?x=1");
    expect(location().hash).toBe("#hash");
  });

  it("push(descriptor) round-trips location.state (the QB card-state case)", () => {
    // query_builder/actions/url.ts dispatches push() with the serialized card on
    // `state`; the migration's history proxy must forward state across engines.
    const { store, location } = setup();
    const cardState = {
      card: { id: 7, name: "Q" },
      cardId: 7,
      objectId: undefined,
    };

    store.dispatch(
      push({
        pathname: "/question",
        search: "?y=2",
        hash: "#abc",
        state: cardState,
      }),
    );

    expect(location().pathname).toBe("/question");
    expect(location().state).toEqual(cardState);
  });

  it("preserves the preserveNavbarState flag on location.state", () => {
    const { store, location } = setup();

    store.dispatch(
      push({ pathname: "/question/1", state: { preserveNavbarState: true } }),
    );

    expect(location().state).toEqual({ preserveNavbarState: true });
  });

  it("distinguishes push from replace via location.action", () => {
    const { store, location } = setup();

    store.dispatch(push("/a"));
    expect(location().action).toBe("PUSH");

    store.dispatch(replace("/b"));
    expect(location().pathname).toBe("/b");
    expect(location().action).toBe("REPLACE");
  });

  it("goBack returns to the previous entry", () => {
    const { store, location } = setup();

    store.dispatch(push("/first"));
    store.dispatch(push("/second"));
    expect(location().pathname).toBe("/second");

    store.dispatch(goBack());
    expect(location().pathname).toBe("/first");
  });

  it("emits @@router/LOCATION_CHANGE with the location payload on every navigation", () => {
    const { store, locationChanges } = setup();

    store.dispatch(push("/one"));
    store.dispatch(push("/two"));

    const paths = locationChanges().map((a) => a.payload.pathname);
    expect(paths).toEqual(expect.arrayContaining(["/one", "/two"]));
  });
});
