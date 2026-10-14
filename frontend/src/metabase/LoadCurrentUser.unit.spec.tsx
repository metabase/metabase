import fetchMock from "fetch-mock";

import { setupCurrentUserEndpoint } from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { refetchSiteSettings, useSetting } from "metabase/settings";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { LoadCurrentUser } from "./LoadCurrentUser";

const PAGE_SITE_NAME = "Site name on the page";
const LOADED_SITE_NAME = "Loaded site name";

const AppContent = ({ onRender }: { onRender: (siteName: string) => void }) => {
  const siteName = useSetting("site-name");
  onRender(siteName);
  return <div>app content</div>;
};

describe("LoadCurrentUser", () => {
  const setup = () => {
    const onRender = jest.fn();

    const { store } = renderWithProviders(
      <Route element={<LoadCurrentUser />}>
        <Route path="/" element={<AppContent onRender={onRender} />} />
      </Route>,
      {
        storeInitialState: createMockState({
          currentUser: undefined,
          settings: createMockSettingsState({ "site-name": PAGE_SITE_NAME }),
        }),
        withRouter: true,
        initialRoute: "/",
      },
    );

    return { onRender, store };
  };

  it("gates its children until the current user has loaded", async () => {
    setupCurrentUserEndpoint(createMockUser());
    setup();

    expect(screen.queryByText("app content")).not.toBeInTheDocument();

    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/user/current")).toHaveLength(
      1,
    );
  });

  it("gates its children until the settings request in flight has settled", async () => {
    setupCurrentUserEndpoint(createMockUser());
    fetchMock.get(
      "path:/api/session/properties",
      createMockSettings({ "site-name": LOADED_SITE_NAME }),
      { delay: 50 },
    );
    const { onRender, store } = setup();
    store.dispatch(refetchSiteSettings());

    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(onRender).toHaveBeenNthCalledWith(1, LOADED_SITE_NAME);
  });

  it("does not wait for the settings when there is no user", async () => {
    fetchMock.get("path:/api/user/current", 401);
    fetchMock.get(
      "path:/api/session/properties",
      createMockSettings({ "site-name": LOADED_SITE_NAME }),
      { delay: 50 },
    );
    const { onRender, store } = setup();
    store.dispatch(refetchSiteSettings());

    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(onRender).toHaveBeenNthCalledWith(1, PAGE_SITE_NAME);
  });
});
