import { act, renderWithProviders, waitFor } from "__support__/ui";
import { Route, navigate } from "metabase/router";

// Characterization test for the module-level `navigate`, the escape hatch that
// non-component code uses instead of a hook. It is the last navigation path with
// no component to anchor it, so the contract it has to keep is pinned here:
//
//   navigate(to, options)  ->  router navigation
//
// The location is read off the router rather than the store, since it is not
// mirrored into redux.

const setup = () => {
  const { router } = renderWithProviders(<Route path="*" element={null} />, {
    withRouter: true,
    initialRoute: "/",
  });

  const location = () => router?.location;

  const go = async (run: () => void) => {
    await act(async () => {
      run();
    });
  };

  return { location, go };
};

describe("navigate contract", () => {
  it("starts at the initial location on mount", async () => {
    const { location } = setup();
    await waitFor(() => expect(location()?.pathname).toBe("/"));
  });

  it("navigate(string) updates pathname, search and hash", async () => {
    const { location, go } = setup();

    await go(() => navigate("/question/42?x=1#hash"));

    expect(location()?.pathname).toBe("/question/42");
    expect(location()?.search).toBe("?x=1");
    expect(location()?.hash).toBe("#hash");
  });

  it("carries location.state across (the QB card-state case)", async () => {
    // query_builder/actions/url.ts navigates with the serialized card on
    // `state`, so the hatch must forward it.
    const { location, go } = setup();
    const cardState = {
      card: { id: 7, name: "Q" },
      cardId: 7,
      objectId: undefined,
    };

    await go(() =>
      navigate(
        { pathname: "/question", search: "?y=2", hash: "#abc" },
        { state: cardState },
      ),
    );

    expect(location()?.pathname).toBe("/question");
    expect(location()?.state).toEqual(cardState);
  });

  it("preserves the preserveNavbarState flag on location.state", async () => {
    const { location, go } = setup();

    await go(() =>
      navigate("/question/1", { state: { preserveNavbarState: true } }),
    );

    expect(location()?.state).toEqual({ preserveNavbarState: true });
  });

  it("adds a history entry, and does not when replacing", async () => {
    const { location, go } = setup();

    await go(() => navigate("/a"));
    await go(() => navigate("/b", { replace: true }));
    expect(location()?.pathname).toBe("/b");

    // `/b` replaced `/a`, so going back lands on the entry before it.
    await go(() => navigate(-1));
    expect(location()?.pathname).toBe("/");
  });

  it("a negative delta returns to the previous entry", async () => {
    const { location, go } = setup();

    await go(() => navigate("/first"));
    await go(() => navigate("/second"));
    expect(location()?.pathname).toBe("/second");

    await go(() => navigate(-1));
    expect(location()?.pathname).toBe("/first");
  });

  it("routes every navigation through the hatch", async () => {
    const { location, go } = setup();

    const seen: string[] = [];
    await go(() => navigate("/one"));
    seen.push(location()?.pathname ?? "");
    await go(() => navigate("/two"));
    seen.push(location()?.pathname ?? "");

    expect(seen).toEqual(["/one", "/two"]);
  });
});
