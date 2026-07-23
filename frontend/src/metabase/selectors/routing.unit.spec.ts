import {
  createMockLocation,
  createMockRoutingState,
  createMockState,
} from "metabase/redux/store/mocks";

import { getLocation } from "./routing";

// Characterization tests — these lock the public shape of `getLocation` so the
// router migration (react-router v3 -> TanStack) cannot silently change what
// `state.routing` exposes. The migration keeps the `routing` slice shape and
// the `locationBeforeTransitions` key on purpose; these tests are the net.
describe("getLocation", () => {
  it("returns state.routing.locationBeforeTransitions", () => {
    const location = createMockLocation({
      pathname: "/question/1",
      search: "?a=1",
      hash: "#abc",
    });
    const state = createMockState({
      routing: createMockRoutingState({ locationBeforeTransitions: location }),
    });

    const result = getLocation(state);
    expect(result.pathname).toBe("/question/1");
    expect(result.search).toBe("?a=1");
    expect(result.hash).toBe("#abc");
  });

  it("falls back to a default location when routing is absent", () => {
    // Unjustified type cast. FIXME
    const state = { ...createMockState(), routing: undefined } as any;

    expect(getLocation(state)).toEqual(createMockLocation({ pathname: "" }));
  });

  it("falls back to a default location before the history sync has run", () => {
    const state = createMockState({
      routing: createMockRoutingState({ locationBeforeTransitions: null }),
    });

    expect(getLocation(state)).toEqual(createMockLocation({ pathname: "" }));
  });
});
