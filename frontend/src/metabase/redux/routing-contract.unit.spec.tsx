import { act, renderWithProviders, waitFor } from "__support__/ui";
import { Route, goBack, push, replace } from "metabase/router";

// Keystone characterization test for the navigation TRANSPORT seam.
//
// `metabase/router` owns the `push`/`replace`/`goBack` action creators, the
// `routerMiddleware`, and the redux bridge that drives the router. This test
// pins the observable contract that survives retiring the `routing` slice:
//
//   dispatch(push/replace/goBack)  ->  router navigation
//
// It wires up the same transport `app.js` uses, isolated from the rest of the
// app graph. The location is read off the router rather than the store, since it
// is no longer mirrored into redux.

const setup = () => {
  const { store, history } = renderWithProviders(
    <Route path="*" element={null} />,
    {
      withRouter: true,
      initialRoute: "/",
    },
  );

  const location = () => history?.getCurrentLocation();

  const navigate = async (action: unknown) => {
    await act(async () => {
      // The transport actions are typed against the app's dispatch, not the
      // test store's inferred action union.
      store.dispatch(action as never);
    });
  };

  return { store, location, navigate };
};

describe("routing transport contract", () => {
  it("starts at the initial location on mount", async () => {
    const { location } = setup();
    await waitFor(() => expect(location()?.pathname).toBe("/"));
  });

  it("push(string) updates pathname, search and hash", async () => {
    const { location, navigate } = setup();

    await navigate(push("/question/42?x=1#hash"));

    expect(location()?.pathname).toBe("/question/42");
    expect(location()?.search).toBe("?x=1");
    expect(location()?.hash).toBe("#hash");
  });

  it("push(descriptor) round-trips location.state (the QB card-state case)", async () => {
    // query_builder/actions/url.ts dispatches push() with the serialized card on
    // `state`, so the transport must forward it.
    const { location, navigate } = setup();
    const cardState = {
      card: { id: 7, name: "Q" },
      cardId: 7,
      objectId: undefined,
    };

    await navigate(
      push({
        pathname: "/question",
        search: "?y=2",
        hash: "#abc",
        state: cardState,
      }),
    );

    expect(location()?.pathname).toBe("/question");
    expect(location()?.state).toEqual(cardState);
  });

  it("preserves the preserveNavbarState flag on location.state", async () => {
    const { location, navigate } = setup();

    await navigate(
      push({ pathname: "/question/1", state: { preserveNavbarState: true } }),
    );

    expect(location()?.state).toEqual({ preserveNavbarState: true });
  });

  it("distinguishes push from replace via location.action", async () => {
    const { location, navigate } = setup();

    await navigate(push("/a"));
    expect(location()?.action).toBe("PUSH");

    await navigate(replace("/b"));
    expect(location()?.pathname).toBe("/b");
    expect(location()?.action).toBe("REPLACE");
  });

  it("goBack returns to the previous entry", async () => {
    const { location, navigate } = setup();

    await navigate(push("/first"));
    await navigate(push("/second"));
    expect(location()?.pathname).toBe("/second");

    await navigate(goBack());
    expect(location()?.pathname).toBe("/first");
  });

  it("routes every navigation through the transport", async () => {
    const { location, navigate } = setup();

    const seen: string[] = [];
    await navigate(push("/one"));
    seen.push(location()?.pathname ?? "");
    await navigate(push("/two"));
    seen.push(location()?.pathname ?? "");

    expect(seen).toEqual(["/one", "/two"]);
  });
});
