import {
  setupBookmarksEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupDocumentErrorEndpoint,
  setupPropertiesEndpoints,
  setupSearchEndpoints,
  setupSettingEndpoint,
  setupTimelinesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen } from "__support__/ui";
import { trackPageView } from "metabase/analytics";
import { DocumentPageOuter } from "metabase/documents/routes";
import { Route } from "metabase/router";
import {
  createMockSettings,
  createMockUser,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { App } from "./AppComponent";

interface SetupOpts {
  initialRoute: string;
}

const setup = ({ initialRoute }: SetupOpts) => {
  setupPropertiesEndpoints(createMockSettings());
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: createMockVersionInfo(),
  });
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupUserMetabotPermissionsEndpoint();
  setupBookmarksEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });
  setupTimelinesEndpoints([]);

  const { router } = renderWithProviders(
    <Route element={<App />}>
      <Route path="/document/:entityId" element={<DocumentPageOuter />} />
      <Route path="/collection/:slug/*" element={<div>Collection</div>} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({ currentUser: createMockUser() }),
    },
  );

  return { navigate: (path: string) => act(() => router?.navigate(path)) };
};

describe("App", () => {
  afterEach(() => {
    jest.mocked(trackPageView).mockClear();
  });

  it("shows the not found page when a page reports a 404", async () => {
    setupDocumentErrorEndpoint(9999, { status: 404 });
    setup({ initialRoute: "/document/9999" });

    expect(
      await screen.findByText("We're a little lost..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The page you asked for couldn't be found."),
    ).toBeInTheDocument();
  });

  // `metabase/analytics` is mocked for every test in `__support__/mocks.js`
  it("tracks a page view for each path the user visits", async () => {
    const { navigate } = setup({ initialRoute: "/collection/root" });
    await screen.findByText("Collection");

    await navigate("/collection/root/timelines/new/events/new");

    expect(jest.mocked(trackPageView).mock.calls).toEqual([
      ["/collection/root"],
      ["/collection/root/timelines/new/events/new"],
    ]);
  });
});
