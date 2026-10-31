import fetchMock from "fetch-mock";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { delay } from "metabase/utils/promise";
import {
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

type SetupOpts = {
  rootCollectionRequest?: "loads-after-collections" | "fails";
};

function mockRootCollectionRequest(
  rootCollectionRequest: NonNullable<SetupOpts["rootCollectionRequest"]>,
) {
  fetchMock.removeRoutes({ names: ["collection-root"] });
  fetchMock.get(
    "path:/api/collection/root",
    rootCollectionRequest === "fails"
      ? 403
      : async () => {
          await delay(300);
          return createMockCollection(ROOT_COLLECTION);
        },
  );
}

function mockPersonalCollectionItemsEndpoint() {
  fetchMock.get("path:/api/collection/222/items", {
    total: 1,
    data: [createMockCollectionItem({ id: 4, name: "personal item" })],
    models: ["card"],
    limit: null,
    offset: null,
  });
}

async function setup({ rootCollectionRequest }: SetupOpts = {}) {
  setupCollectionsEndpoints({
    collections: [COLLECTIONS.PERSONAL, COLLECTIONS.REGULAR],
  });

  mockCollectionItemsEndpoint();
  mockPersonalCollectionItemsEndpoint();

  if (rootCollectionRequest) {
    mockRootCollectionRequest(rootCollectionRequest);
  }

  renderWithProviders(
    <SavedEntityPicker
      type="question"
      onSelect={jest.fn()}
      onBack={jest.fn()}
    />,
  );
  await waitForLoaderToBeRemoved();
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

  it("opens on Our analytics when the root collection loads after the collections", async () => {
    await setup({ rootCollectionRequest: "loads-after-collections" });

    await screen.findByText("Our analytics");
    const options = await screen.findAllByTestId("option-text");
    expect(options.map((node) => node.textContent)).toEqual(["a", "A", "B"]);
  });

  it("opens on the first collection when the root collection request fails", async () => {
    await setup({ rootCollectionRequest: "fails" });

    const options = await screen.findAllByTestId("option-text");
    expect(options.map((node) => node.textContent)).toEqual(["personal item"]);
    expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();
  });
});
