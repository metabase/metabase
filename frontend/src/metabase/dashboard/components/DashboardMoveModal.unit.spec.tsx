import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { DashboardMoveModalConnected } from "./DashboardMoveModal";

const TEST_DASHBOARD = createMockDashboard({ id: 1, name: "Sales overview" });

function setupPickerEndpoints() {
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();

  const rootCollection = createMockCollection(ROOT_COLLECTION);
  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({ collections: [], rootCollection });
  setupCollectionByIdEndpoint({ collections: [] });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionItemsEndpoint({
    collection: rootCollection,
    collectionItems: [],
  });
  fetchMock.get("path:/api/search", { data: [] });
  fetchMock.get("path:/api/user/recipients", { data: [] });
}

const setup = ({
  slug = "1-sales-overview",
  onClose = jest.fn(),
}: {
  slug?: string;
  onClose?: () => void;
} = {}) => {
  renderWithProviders(
    <DashboardMoveModalConnected params={{ slug }} onClose={onClose} />,
  );

  return { onClose };
};

describe("DashboardMoveModalConnected", () => {
  it("fetches the dashboard from the slug and renders the move modal", async () => {
    setupPickerEndpoints();
    setupDashboardEndpoints(TEST_DASHBOARD);

    setup();

    expect(await screen.findByText("Move dashboard to…")).toBeInTheDocument();
  });

  it("shows a loading spinner while the dashboard is loading", () => {
    setupPickerEndpoints();
    setupDashboardEndpoints(TEST_DASHBOARD);

    setup();

    expect(screen.queryByText("Move dashboard to…")).not.toBeInTheDocument();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("shows an error and does not render the modal when the dashboard cannot be found", async () => {
    setupPickerEndpoints();
    setupDashboardNotFoundEndpoint(TEST_DASHBOARD);

    setup();

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(screen.queryByText("Move dashboard to…")).not.toBeInTheDocument();
  });

  it("renders nothing when the slug has no id", () => {
    setup({ slug: "" });

    expect(screen.queryByText("Move dashboard to…")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });
});
