import appReducer, {
  closeNavbar,
  isNavbarOpenForPathname,
  openNavbar,
  resetErrorPage,
  setErrorPage,
  toggleNavbar,
} from "metabase/redux/app";

// Characterization tests for the two reducers that react to navigation via the
// `@@router/LOCATION_CHANGE` action (`isNavbarOpen` collapse-by-pathname and
// `errorPage` clear-on-navigate). The router migration re-owns this action with
// a byte-identical type string and payload shape, so these tests must keep
// passing through the migration — they lock the subtle behaviour most likely to
// drift.

const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";

const locationChange = (payload: Record<string, unknown>) => ({
  type: LOCATION_CHANGE,
  payload,
});

const initialState = () => appReducer(undefined, { type: "@@INIT" });

describe("app reducer — navigation reactions", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("isNavbarOpen on LOCATION_CHANGE", () => {
    it("collapses when navigating to a path in the collapse list", () => {
      const state = appReducer(
        initialState(),
        locationChange({ pathname: "/question/1" }),
      );
      expect(state.isNavbarOpen).toBe(false);
    });

    it("stays open when navigating to a non-collapsing path", () => {
      const state = appReducer(
        initialState(),
        locationChange({ pathname: "/collection/1" }),
      );
      expect(state.isNavbarOpen).toBe(true);
    });

    it("preserves the previous state when payload.state.preserveNavbarState is set", () => {
      const state = appReducer(
        initialState(),
        locationChange({
          pathname: "/question/1",
          state: { preserveNavbarState: true },
        }),
      );
      expect(state.isNavbarOpen).toBe(true);
    });

    // Word-boundary cases pinned by the regex comment in app.ts: a partial match
    // must not collapse the navbar.
    it.each([
      ["/model/1", false], // a model — collapses
      ["/browse/models", true], // listing — must NOT collapse
      ["/question/1", false], // a question — collapses
      ["/reference/segments/1/questions", true], // listing — must NOT collapse
      ["/dashboard/1", false],
      ["/metabot", false],
      ["/document/1", false],
      ["/explore", false],
      ["/collection/root", true],
      ["/browse/databases", true],
    ])("pathname %s => isNavbarOpen %s", (pathname, expected) => {
      const state = appReducer(initialState(), locationChange({ pathname }));
      expect(state.isNavbarOpen).toBe(expected);
    });

    it("does not reopen a closed navbar just because the path is non-collapsing", () => {
      const closed = appReducer(initialState(), closeNavbar());
      const state = appReducer(
        closed,
        locationChange({ pathname: "/collection/1" }),
      );
      expect(state.isNavbarOpen).toBe(false);
    });
  });

  describe("isNavbarOpen on explicit actions", () => {
    it("opens / closes / toggles", () => {
      let state = appReducer(initialState(), closeNavbar());
      expect(state.isNavbarOpen).toBe(false);

      state = appReducer(state, openNavbar());
      expect(state.isNavbarOpen).toBe(true);

      state = appReducer(state, toggleNavbar());
      expect(state.isNavbarOpen).toBe(false);
    });
  });

  describe("errorPage", () => {
    it("is cleared on navigation", () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      const withError = appReducer(
        initialState(),
        setErrorPage({ status: 500 }),
      );
      expect(withError.errorPage).toEqual({ status: 500 });

      const navigated = appReducer(
        withError,
        locationChange({ pathname: "/question/1" }),
      );
      expect(navigated.errorPage).toBeNull();
    });

    it("is cleared on resetErrorPage", () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      const withError = appReducer(
        initialState(),
        setErrorPage({ status: 404 }),
      );
      const reset = appReducer(withError, resetErrorPage());
      expect(reset.errorPage).toBeNull();
    });
  });
});

describe("isNavbarOpenForPathname", () => {
  it.each([
    ["/question/1", true, false],
    ["/collection/1", true, true],
    ["/browse/models", true, true],
    ["/model/1", true, false],
    // a collapsing path can never force the navbar open when it was closed
    ["/collection/1", false, false],
  ])("pathname %s with prevState %s => %s", (pathname, prevState, expected) => {
    expect(isNavbarOpenForPathname(pathname, prevState)).toBe(expected);
  });
});
