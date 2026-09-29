import appReducer, { resetErrorPage, setErrorPage } from "metabase/redux/app";

// Characterization test for the reducer that reacts to navigation via the
// `@@router/LOCATION_CHANGE` action (`errorPage` clear-on-navigate). The router migration
// re-owns this action with a byte-identical type string and payload shape, so this must keep
// passing through the migration.

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
