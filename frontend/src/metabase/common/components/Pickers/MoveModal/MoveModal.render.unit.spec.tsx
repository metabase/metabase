import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import type { OmniPickerCollectionItem } from "../EntityPicker";

import { MoveModal } from "./MoveModal";

const rootCollection = createMockCollection(ROOT_COLLECTION);

const collection1 = createMockCollection({
  id: 11,
  name: "First Collection",
  here: ["card"],
  below: ["card"],
  location: "/",
  can_write: true,
});

const rootCollectionItems = [
  createMockCollectionItem({
    id: 11,
    model: "collection",
    name: collection1.name,
    here: ["collection"],
    below: ["collection", "card"],
    collection_id: null,
    can_write: true,
  }),
];

function setupEndpoints() {
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();

  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [collection1],
    rootCollection,
  });
  setupCollectionByIdEndpoint({ collections: [collection1] });
  setupRootCollectionItemsEndpoint({ rootCollectionItems });
  setupCollectionItemsEndpoint({
    collection: collection1,
    collectionItems: [],
  });
  fetchMock.get("path:/api/search", { data: [] });
  fetchMock.get("path:/api/user/recipients", { data: [] });
}

const movingCard = {
  id: 1,
  name: "Test Question",
  model: "card",
  collection: { id: 11, name: "First Collection", authority_level: null },
} as OmniPickerCollectionItem;

const movingDashboard = {
  id: 2,
  name: "Test Dashboard",
  model: "dashboard",
  collection: { id: 11, name: "First Collection", authority_level: null },
} as OmniPickerCollectionItem;

describe("MoveModal", () => {
  beforeEach(() => {
    setupEndpoints();
  });

  it('should show "New dashboard" button when moving a question (canMoveToDashboard=true)', async () => {
    renderWithProviders(
      <MoveModal
        title="Move question"
        onClose={jest.fn()}
        onMove={jest.fn()}
        movingItem={movingCard}
        canMoveToDashboard
      />,
    );

    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByRole("button", { name: /new dashboard/i }),
    ).toBeInTheDocument();
  });

  it('should not show "New dashboard" button when canMoveToDashboard is false', async () => {
    renderWithProviders(
      <MoveModal
        title="Move dashboard"
        onClose={jest.fn()}
        onMove={jest.fn()}
        movingItem={movingDashboard}
        canMoveToDashboard={false}
      />,
    );

    await waitForLoaderToBeRemoved();

    // Wait for picker content to load
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new dashboard/i }),
    ).not.toBeInTheDocument();
  });
});
