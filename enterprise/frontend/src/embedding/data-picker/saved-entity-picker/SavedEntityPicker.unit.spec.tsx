import fetchMock from "fetch-mock";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { cardApi } from "metabase/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
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

const SALES = createMockCollection({ id: 3, name: "Sales", here: [] });

function setupModelCreation() {
  const collections = [SALES];

  setupCollectionsEndpoints({ collections });
  fetchMock.get("path:/api/collection/root/items", {
    total: 0,
    data: [],
    models: [],
    limit: null,
    offset: null,
  });
  fetchMock.post("path:/api/card", () => {
    collections[0] = { ...SALES, here: ["dataset"] };
    return createMockCard({ id: 10, type: "model", collection_id: SALES.id });
  });

  return renderWithProviders(
    <SavedEntityPicker type="model" onSelect={jest.fn()} onBack={jest.fn()} />,
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

  it("should show a collection after a model is saved into it", async () => {
    const { store } = setupModelCreation();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/collection/tree"),
      ).toHaveLength(1),
    );
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();

    const model = createMockCard({ type: "model", collection_id: SALES.id });
    await store.dispatch(
      cardApi.endpoints.createCard.initiate({
        name: model.name,
        type: model.type,
        dataset_query: model.dataset_query,
        display: model.display,
        visualization_settings: model.visualization_settings,
        collection_id: model.collection_id,
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
