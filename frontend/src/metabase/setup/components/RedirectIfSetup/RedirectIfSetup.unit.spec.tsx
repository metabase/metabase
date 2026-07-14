import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { sessionApi } from "metabase/api/session";
import type { DispatchFn } from "metabase/redux/hooks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
import { createMockSettings } from "metabase-types/api/mocks";

import { RedirectIfSetup } from "./RedirectIfSetup";

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

  it("stays on setup when has-user-setup flips to true mid-wizard", async () => {
    const { history, store } = setup(false);
    expect(screen.getByText("setup page")).toBeInTheDocument();

    // The wizard's user step calls /api/setup, then reloads settings via
    // `refetchSiteSettings`, flipping `has-user-setup` to true midway. Mirror
    // that by writing the refreshed value into the session-properties cache.
    await act(async () => {
      // The store's test-harness dispatch type isn't thunk-aware; the app
      // dispatch (`DispatchFn`) is.
      await (store.dispatch as DispatchFn)(
        sessionApi.util.upsertQueryData(
          "getSessionProperties",
          undefined,
          createMockSettings({ "has-user-setup": true }),
        ),
      );
    });

    // Guards against the setting not actually flipping and voiding this test.
    expect(getSetting(store.getState(), "has-user-setup")).toBe(true);

    expect(history?.getCurrentLocation().pathname).toBe("/setup");
    expect(screen.getByText("setup page")).toBeInTheDocument();
  });
});
