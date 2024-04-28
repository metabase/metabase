import fetchMock from "fetch-mock";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import SavedEntityPicker from "./SavedEntityPicker";

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
  fetchMock.get(
    {
      url: "path:/api/collection/root/items",
      query: {
        sort_column: "name",
        sort_direction: "asc",
      },
    },
    {
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
  );
}

async function setup() {
  setupCollectionsEndpoints({
    collections: [COLLECTIONS.PERSONAL, COLLECTIONS.REGULAR],
  });

  mockCollectionItemsEndpoint();

  renderWithProviders(
    <SavedEntityPicker onSelect={jest.fn()} onBack={jest.fn()} />,
  );
  await waitForLoaderToBeRemoved();
}

describe("SavedEntityPicker", () => {
  it("shows the current user personal collection on the top after the root", async () => {
    await setup();

    expect(
      screen.getAllByTestId("tree-item-name").map(node => node.textContent),
    ).toEqual([
      "Our analytics",
      "Your personal collection",
      "Regular collection",
    ]);
  });

  it("sorts saved questions case-insensitive (metabase#23693)", async () => {
    await setup();

    expect(
      screen.getAllByTestId("option-text").map(node => node.textContent),
    ).toEqual(["a", "A", "B"]);
  });
});
