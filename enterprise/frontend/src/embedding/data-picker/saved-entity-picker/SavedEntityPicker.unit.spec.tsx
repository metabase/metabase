import fetchMock from "fetch-mock";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { dashboardApi } from "metabase/api";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { SavedEntityPicker } from "./SavedEntityPicker";

const CURRENT_USER = {
  id: 1,
  personal_collection_id: 222,
  is_superuser: true,
};

const COLLECTIONS = {
  PERSONAL: createMockCollection({
    id: CURRENT_USER.personal_collection_id,
    name: "My personal collection",
    personal_owner_id: CURRENT_USER.id,
    here: ["card"],
  }),
  REGULAR: createMockCollection({
    id: 1,
    name: "Regular collection",
    here: ["card"],
  }),
};

function mockCollectionItemsEndpoint() {
  fetchMock.get({
    url: "path:/api/collection/root/items",
    query: {
      "sort-column": "name",
      "sort-direction": "asc",
    },
    response: {
      total: 3,
      data: [
        createMockCollectionItem({
          id: 2,
          name: "a",
        }),
        createMockCollectionItem({
          id: 3,
          name: "A",
        }),
        createMockCollectionItem({
          id: 1,
          name: "B",
        }),
      ],
      models: ["card"],
      limit: null,
      offset: null,
    },
  });
}

async function setup() {
  setupCollectionsEndpoints({
    collections: [COLLECTIONS.PERSONAL, COLLECTIONS.REGULAR],
  });

  mockCollectionItemsEndpoint();

  renderWithProviders(
    <SavedEntityPicker
      type="question"
      onSelect={jest.fn()}
      onBack={jest.fn()}
    />,
  );
  await waitForLoaderToBeRemoved();
}

const DASHBOARD_ID = 10;
const SALES = createMockCollection({ id: 3, name: "Sales" });

function setupDashboardCopy({ salesItems }: { salesItems: CollectionItem[] }) {
  const sales = {
    ...SALES,
    here: salesItems.length > 0 ? ["card" as const] : [],
  };
  const collections = [sales];
  const items = [...salesItems];

  setupCollectionsEndpoints({ collections });
  fetchMock.get("path:/api/collection/root/items", {
    total: 0,
    data: [],
    models: [],
    limit: null,
    offset: null,
  });
  fetchMock.get(`path:/api/collection/${SALES.id}/items`, () => ({
    total: items.length,
    data: items,
    models: ["card"],
    limit: null,
    offset: null,
  }));
  fetchMock.post(`path:/api/dashboard/${DASHBOARD_ID}/copy`, () => {
    items.push(createMockCollectionItem({ id: 21, name: "Revenue" }));
    collections[0] = { ...sales, here: ["card"] };
    return createMockDashboard({ id: 20, collection_id: SALES.id });
  });

  return renderWithProviders(
    <SavedEntityPicker
      type="question"
      collectionId={SALES.id}
      onSelect={jest.fn()}
      onBack={jest.fn()}
    />,
  );
}

describe("SavedEntityPicker", () => {
  it("shows the current user personal collection on the top after the root", async () => {
    await setup();

    const treeItems = await screen.findAllByTestId("tree-item-name");

    expect(treeItems.map((node) => node.textContent)).toEqual([
      "Our analytics",
      "Your personal collection",
      "Regular collection",
    ]);
  });

  it("sorts saved questions case-insensitive (metabase#23693)", async () => {
    await setup();

    expect(
      screen.getAllByTestId("option-text").map((node) => node.textContent),
    ).toEqual(["a", "A", "B"]);
  });

  it("should list the questions that duplicating a dashboard adds to a collection", async () => {
    const { store } = setupDashboardCopy({
      salesItems: [createMockCollectionItem({ id: 20, name: "Orders" })],
    });
    const itemsUrl = `path:/api/collection/${SALES.id}/items`;
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(itemsUrl)).toHaveLength(1),
    );
    expect(await screen.findByText("Orders")).toBeInTheDocument();

    await store.dispatch(
      dashboardApi.endpoints.copyDashboard.initiate({
        id: DASHBOARD_ID,
        collection_id: SALES.id,
        is_deep_copy: true,
      }),
    );

    await waitFor(() =>
      expect(fetchMock.callHistory.calls(itemsUrl)).toHaveLength(2),
    );
    expect(await screen.findByText("Revenue")).toBeInTheDocument();
  });

  it("should show a collection after duplicating a dashboard into it", async () => {
    const { store } = setupDashboardCopy({ salesItems: [] });
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/collection/tree"),
      ).toHaveLength(1),
    );
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();

    await store.dispatch(
      dashboardApi.endpoints.copyDashboard.initiate({
        id: DASHBOARD_ID,
        collection_id: SALES.id,
        is_deep_copy: true,
      }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/collection/tree"),
      ).toHaveLength(2),
    );
    expect(await screen.findByText("Sales")).toBeInTheDocument();
  });
});
