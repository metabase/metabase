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
import { renderWithProviders, screen } from "__support__/ui";
import { DocumentPageOuter } from "metabase/documents/routes";
import { Route } from "metabase/router";
import {
  createMockSettings,
  createMockUser,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { App } from "./AppComponent";

const setup = ({ initialRoute }: { initialRoute: string }) => {
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

  renderWithProviders(
    <Route element={<App />}>
      <Route path="/document/:entityId" element={<DocumentPageOuter />} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({ currentUser: createMockUser() }),
    },
  );
};

describe("App", () => {
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
});
