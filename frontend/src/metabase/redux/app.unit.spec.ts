import appReducer, {
  closeNavbar,
  openNavbar,
  resetErrorPage,
  setErrorPage,
  toggleNavbar,
} from "metabase/redux/app";

// Characterization tests for the two reducers that react to navigation via the
// `@@router/LOCATION_CHANGE` action (`isNavbarOpen` preserve-across-navigation
// and `errorPage` clear-on-navigate). The navbar only changes on explicit user
// action, so navigation must never collapse it on a regular (non-small) screen.

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
    // The navbar no longer collapses based on the destination pathname; it
    // stays open unless the user closed it themselves.
    it.each([
      "/question/1",
      "/model/1",
      "/dashboard/1",
      "/metabot",
      "/document/1",
      "/explore",
      "/collection/1",
      "/browse/models",
    ])("stays open when navigating to %s", (pathname) => {
      const state = appReducer(initialState(), locationChange({ pathname }));
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

    it("keeps a manually-closed navbar closed across navigation", () => {
      const closed = appReducer(initialState(), closeNavbar());
      const state = appReducer(
        closed,
        locationChange({ pathname: "/question/1" }),
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
