import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { createMockDashboardState } from "__support__/state";
import { renderRoutes, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import { DashboardCopyModalConnected } from "./DashboardCopyModal";

const PERSONAL_COLLECTION = createMockCollection({
  id: 301,
  name: "Robert Tableton's Personal Collection",
  is_personal: true,
  can_write: true,
});

interface SetupOpts {
  rootCollection: Collection;
}

function setup({ rootCollection }: SetupOpts) {
  const dashboard = createMockDashboard({
    id: 1,
    name: "Orders in a dashboard",
    collection_id: null,
    collection: rootCollection,
    can_write: rootCollection.can_write,
  });

  setupDashboardEndpoints(dashboard);
  setupCollectionByIdEndpoint({
    collections: [rootCollection, PERSONAL_COLLECTION],
  });

  renderRoutes(
    [
      {
        path: "/dashboard/:slug/copy",
        element: <DashboardCopyModalConnected onClose={jest.fn()} />,
      },
    ],
    {
      initialRoute: `/dashboard/${dashboard.id}/copy`,
      storeInitialState: {
        currentUser: createMockUser({
          personal_collection_id: PERSONAL_COLLECTION.id,
        }),
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: { [dashboard.id]: { ...dashboard, dashcards: [] } },
        }),
      },
    },
  );
}

describe("DashboardCopyModal", () => {
  it("should default to the personal collection when the user cannot write to the dashboard's collection (metabase#15280)", async () => {
    setup({
      rootCollection: createMockCollection({
        ...ROOT_COLLECTION,
        can_write: false,
      }),
    });

    expect(
      await screen.findByText(PERSONAL_COLLECTION.name, {
        selector: "[data-testid='collection-picker-button'] *",
      }),
    ).toBeInTheDocument();
  });

  it("should default to the dashboard's collection when the user can write to it", async () => {
    setup({
      rootCollection: createMockCollection({
        ...ROOT_COLLECTION,
        can_write: true,
      }),
    });

    expect(
      await screen.findByText("Our analytics", {
        selector: "[data-testid='collection-picker-button'] *",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(PERSONAL_COLLECTION.name),
    ).not.toBeInTheDocument();
  });
});
