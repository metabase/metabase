import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import type { SavedEntityType } from "../types";

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

const LIBRARY_METRICS_COLLECTION = createMockCollection({
  id: 6466,
  name: "Metrics",
  type: "library-metrics",
  here: ["metric"],
});
const LIBRARY_COLLECTION = createMockCollection({
  id: 6464,
  name: "Library",
  type: "library",
  below: ["metric"],
  children: [
    createMockCollection({ id: 6465, name: "Data", type: "library-data" }),
    LIBRARY_METRICS_COLLECTION,
  ],
});

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

interface SetupOpts {
  type?: SavedEntityType;
  collections?: Collection[];
}

async function setup({
  type = "question",
  collections = [COLLECTIONS.PERSONAL, COLLECTIONS.REGULAR],
}: SetupOpts = {}) {
  setupCollectionsEndpoints({ collections });

  mockCollectionItemsEndpoint();

  renderWithProviders(
    <SavedEntityPicker type={type} onSelect={jest.fn()} onBack={jest.fn()} />,
  );
  // The picker renders nothing, not a loader, until its collections load
  await screen.findByTestId("saved-entity-collection-tree");
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

    const options = await screen.findAllByTestId("option-text");
    expect(options.map((node) => node.textContent)).toEqual(["a", "A", "B"]);
  });

  it("requests Library collections so items published in the Library are listed", async () => {
    await setup();

    const [call] = fetchMock.callHistory.calls("path:/api/collection/tree");
    expect(new URL(call.url).searchParams.get("include-library")).toBe("true");
  });

  it("lists the metrics in the Library's Metrics folder when selecting the Library collection in the Metrics bucket", async () => {
    setupCollectionItemsEndpoint({
      collection: LIBRARY_METRICS_COLLECTION,
      collectionItems: [
        createMockCollectionItem({ id: 4, name: "Revenue", model: "metric" }),
      ],
    });
    await setup({ type: "metric", collections: [LIBRARY_COLLECTION] });

    const tree = screen.getByTestId("saved-entity-collection-tree");
    expect(within(tree).queryByText("Metrics")).not.toBeInTheDocument();
    await userEvent.click(within(tree).getByText("Library"));

    expect(await screen.findByText("Revenue")).toBeInTheDocument();
  });
});
