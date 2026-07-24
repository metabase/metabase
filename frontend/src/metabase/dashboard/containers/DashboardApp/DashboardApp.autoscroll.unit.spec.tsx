import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  renderWithProviders,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

const TARGET_TEXT = "Scroll to me plz.";
const DASHBOARD_ID = 1;
const TARGET_DASHCARD_ID = 42;

async function setup({ hash = "" }: { hash?: string } = {}) {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    dashcards: [
      createMockTextDashboardCard({
        id: 1,
        dashboard_id: DASHBOARD_ID,
        row: 0,
        text: "I'm just padding",
      }),
      createMockTextDashboardCard({
        id: TARGET_DASHCARD_ID,
        dashboard_id: DASHBOARD_ID,
        row: 10,
        text: TARGET_TEXT,
      }),
    ],
  });

  const database = createMockDatabase();
  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([database]);
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  setupCollectionsEndpoints({ collections: [] });
  setupSearchEndpoints([]);
  setupCardsEndpoints([]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const scrollIntoView = jest.spyOn(HTMLElement.prototype, "scrollIntoView");

  const { history } = renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${dashboard.id}${hash}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForLoaderToBeRemoved();

  const getTargetDashcard = () =>
    checkNotNull(
      document.querySelector(`[data-dashcard-key="${TARGET_DASHCARD_ID}"]`),
    );

  const wasTargetScrolledIntoView = () =>
    scrollIntoView.mock.contexts.some(
      (context) => context === getTargetDashcard(),
    );

  return { history: checkNotNull(history), wasTargetScrolledIntoView };
}

describe("DashboardApp auto-scroll", () => {
  it("scrolls to the dashcard named by the scrollTo hash param and clears the hash", async () => {
    const { history, wasTargetScrolledIntoView } = await setup({
      hash: `#scrollTo=${TARGET_DASHCARD_ID}`,
    });

    await waitFor(() => expect(history.getCurrentLocation().hash).toBe(""));

    expect(wasTargetScrolledIntoView()).toBe(true);
  });

  it("scrolls when the scrollTo hash param is added to the dashboard already on screen", async () => {
    const { history, wasTargetScrolledIntoView } = await setup();

    expect(wasTargetScrolledIntoView()).toBe(false);

    act(() => {
      history.push(`/dashboard/${DASHBOARD_ID}#scrollTo=${TARGET_DASHCARD_ID}`);
    });

    await waitFor(() => expect(history.getCurrentLocation().hash).toBe(""));

    expect(wasTargetScrolledIntoView()).toBe(true);
  });

  it("does not scroll when there is no scrollTo hash param", async () => {
    const { history, wasTargetScrolledIntoView } = await setup();

    expect(wasTargetScrolledIntoView()).toBe(false);
    expect(history.getCurrentLocation().hash).toBe("");
  });
});
