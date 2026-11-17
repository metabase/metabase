import userEvent from "@testing-library/user-event";

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
import { act, renderRoutes, screen, waitFor } from "__support__/ui";
import { trackPageView } from "metabase/analytics";
import { DocumentPageOuter } from "metabase/documents/routes";
import { Outlet } from "metabase/router";
import { getCollectionTimelineRoutes } from "metabase/timelines/collections/routes";
import { setupTimelineServer } from "metabase/timelines/collections/test-utils/fake-timeline-server";
import {
  createMockCollection,
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

  const { router } = renderRoutes(
    [
      {
        element: <App />,
        children: [
          { path: "/document/:entityId", element: <DocumentPageOuter /> },
          {
            path: "/collection/:slug",
            element: <CollectionPage />,
            children: getCollectionTimelineRoutes(),
          },
        ],
      },
    ],
    {
      initialRoute,
      storeInitialState: createMockState({ currentUser: createMockUser() }),
    },
  );

  return {
    pathname: () => router?.location.pathname,
    navigate: (path: string) => act(() => router?.navigate(path)),
  };
};

function CollectionPage() {
  return (
    <div>
      <span>Collection</span>
      <Outlet />
    </div>
  );
}

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
  it("tracks a page view for each page of the new event flow in a collection", async () => {
    setupTimelineServer({
      collections: [
        createMockCollection({ id: "root", name: "Our analytics" }),
      ],
    });
    const { navigate, pathname } = setup({ initialRoute: "/collection/root" });
    await screen.findByText("Collection");

    await navigate("/collection/root/timelines");
    await userEvent.click(
      await screen.findByRole("button", { name: "Create event" }),
    );
    await userEvent.type(await screen.findByLabelText("Event name"), "Event");
    await userEvent.type(screen.getByLabelText("Date"), "10/20/2026");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(pathname()).toBe("/collection/root/timelines"));
    expect(jest.mocked(trackPageView).mock.calls).toEqual([
      ["/collection/root"],
      ["/collection/root/timelines"],
      ["/collection/root/timelines/new/events/new"],
      ["/collection/root/timelines"],
    ]);
  });
});
