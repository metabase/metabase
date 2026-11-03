import { QueryStatus } from "@reduxjs/toolkit/query";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { defer } from "metabase/utils/promise";
import type { Collection } from "metabase-types/api";
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
  const rootCollection = defer<Collection>();
  fetchMock.removeRoutes({ names: ["collection-root"] });
  fetchMock.get(
    "path:/api/collection/root",
    rootCollectionRequest === "fails" ? 403 : () => rootCollection.promise,
  );
  return () => rootCollection.resolve(createMockCollection(ROOT_COLLECTION));
}

async function setup({ rootCollectionRequest }: SetupOpts = {}) {
  setupCollectionsEndpoints({
    collections: [COLLECTIONS.PERSONAL, COLLECTIONS.REGULAR],
  });

  mockCollectionItemsEndpoint();

  let resolveRootCollection = () => {};
  if (rootCollectionRequest) {
    resolveRootCollection = mockRootCollectionRequest(rootCollectionRequest);
    setupCollectionItemsEndpoint({
      collection: COLLECTIONS.PERSONAL,
      collectionItems: [
        createMockCollectionItem({ id: 4, name: "personal item" }),
      ],
    });
  }

  const { store } = renderWithProviders(
    <SavedEntityPicker
      type="question"
      onSelect={jest.fn()}
      onBack={jest.fn()}
    />,
  );
  await waitForLoaderToBeRemoved();

  return { store, resolveRootCollection };
}

function hasLoadedCollectionsTree(
  store: Awaited<ReturnType<typeof setup>>["store"],
) {
  return Object.values(store.getState()["metabase-api"].queries).some(
    (query) =>
      query?.endpointName === "listCollectionsTree" &&
      query.status === QueryStatus.fulfilled,
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

  it("opens on Our analytics when the root collection loads after the collections", async () => {
    const { store, resolveRootCollection } = await setup({
      rootCollectionRequest: "loads-after-collections",
    });

    // answer "Our analytics" only once the collections tree has loaded
    await waitFor(() => expect(hasLoadedCollectionsTree(store)).toBe(true));
    resolveRootCollection();

    await screen.findByText("Our analytics");
    const options = await screen.findAllByTestId("option-text");
    expect(options.map((node) => node.textContent)).toEqual(["a", "A", "B"]);
  });

  it("opens on the personal collection when the root collection request fails", async () => {
    await setup({ rootCollectionRequest: "fails" });

    const options = await screen.findAllByTestId("option-text");
    expect(options.map((node) => node.textContent)).toEqual(["personal item"]);
    expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();
  });
});
