import userEvent from "@testing-library/user-event";

import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderRoutes, screen, waitForDashboardToLoad } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { getDashboardRoute } from "metabase/dashboard/routes";
import {
  createMockCollection,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

const PERSONAL_COLLECTION = createMockCollection({
  id: 301,
  name: "Robert Tableton's Personal Collection",
  is_personal: true,
  can_write: true,
});

const READ_ONLY_ROOT = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: false,
});

async function setup() {
  const dashboard = createMockDashboard({
    id: 1,
    name: "Orders in a dashboard",
    collection_id: null,
    collection: READ_ONLY_ROOT,
    can_write: false,
  });
  const database = createMockDatabase();

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([database]);
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  setupCollectionsEndpoints({
    collections: [PERSONAL_COLLECTION],
    rootCollection: READ_ONLY_ROOT,
  });
  setupCollectionByIdEndpoint({
    collections: [READ_ONLY_ROOT, PERSONAL_COLLECTION],
  });
  setupSearchEndpoints([]);
  setupCardsEndpoints([]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const { router } = renderRoutes(
    [{ path: "/", children: [getDashboardRoute()] }],
    {
      initialRoute: `/dashboard/${dashboard.id}`,
      storeInitialState: {
        currentUser: createMockUser({
          personal_collection_id: PERSONAL_COLLECTION.id,
        }),
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForDashboardToLoad();

  return { dashboard, router };
}

describe("DashboardApp > duplicate", () => {
  it("should open the copy modal in the personal collection for a read-only dashboard (metabase#15280)", async () => {
    const { dashboard, router } = await setup();

    await userEvent.click(
      await screen.findByRole("button", { name: /Move, trash, and more/ }),
    );
    expect(screen.queryByText("Move")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByText("Duplicate"));

    expect(router?.location.pathname).toBe(`/dashboard/${dashboard.id}/copy`);
    expect(
      await screen.findByText(PERSONAL_COLLECTION.name, {
        selector: "[data-testid='collection-picker-button'] *",
      }),
    ).toBeInTheDocument();
  });
});
