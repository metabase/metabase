import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockSettings } from "metabase-types/api/mocks";

import { RedirectIfSetup } from "./RedirectIfSetup";

// The `loadSettings` action, inlined: importing `metabase/redux/settings` pulls
// in an import graph large enough to exhaust the jest heap.
const loadSettings = (values: ReturnType<typeof createMockSettings>) => ({
  type: "metabase/settings/LOAD_SETTINGS",
  payload: values,
});

describe("RedirectIfSetup", () => {
  const setup = (hasUserSetup: boolean) =>
    renderWithProviders(
      <>
        <Route element={<RedirectIfSetup />}>
          <Route path="setup" element={<div>setup page</div>} />
        </Route>
        <Route path="/" element={<div>home page</div>} />
      </>,
      {
        storeInitialState: createMockState({
          settings: createMockSettingsState({ "has-user-setup": hasUserSetup }),
        }),
        withRouter: true,
        initialRoute: "/setup",
      },
    );

  it("renders the setup page when the instance is not set up", () => {
    setup(false);
    expect(screen.getByText("setup page")).toBeInTheDocument();
  });

  it("redirects to the home page once the instance is set up", async () => {
    const { history } = setup(true);
    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/"),
    );
    expect(screen.queryByText("setup page")).not.toBeInTheDocument();
  });

  it("stays on setup when has-user-setup flips to true mid-wizard", () => {
    const { history, store } = setup(false);
    expect(screen.getByText("setup page")).toBeInTheDocument();

    // The wizard's user step calls /api/setup, then reloads settings.
    act(() => {
      store.dispatch(
        loadSettings(createMockSettings({ "has-user-setup": true })),
      );
    });

    // Guards against the inlined action type drifting and voiding this test.
    expect(store.getState().settings.values["has-user-setup"]).toBe(true);

    expect(history?.getCurrentLocation().pathname).toBe("/setup");
    expect(screen.getByText("setup page")).toBeInTheDocument();
  });
});
