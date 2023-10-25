import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { AddCardSidebar } from "./AddCardSidebar";

async function setup() {
  setupCollectionsEndpoints({
    collections: [],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection(ROOT_COLLECTION),
    collectionItems: [],
  });

  const dashboard = createMockDashboard();
  renderWithProviders(<AddCardSidebar onSelect={jest.fn()} />, {
    storeInitialState: createMockState({
      dashboard: createMockDashboardState({
        dashboards: {
          [dashboard.id]: { ...dashboard, dashcards: [] },
        },
        dashboardId: dashboard.id,
      }),
    }),
  });

  await waitFor(() => {
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
}

describe("AddCardSideBar", () => {
  it("should render no items", async () => {
    await setup();

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
