import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type {
  Collection,
  CollectionItem,
  SearchResult,
  User,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockRecentCollectionItem,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import type { OmniPickerCollectionItem } from "../EntityPicker";
import {
  ADMIN_PERSONAL_COLLECTION,
  ADMIN_USER,
  FIRST_COLLECTION,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION,
  NORMAL_USER,
  ROOT,
  expectSearchResults,
  findSearchResult,
  getLastSearchParams,
  getRootItem,
  getScopeRadio,
  getSearchScopeSelector,
  typeSearchText,
} from "../tests/search";

import { BulkMoveModal, MoveModal } from "./MoveModal";

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

// Unjustified type cast. FIXME
const movingCard = {
  id: 1,
  name: "Test Question",
  model: "card",
  collection: { id: 11, name: "First Collection", authority_level: null },
} as OmniPickerCollectionItem;

// Unjustified type cast. FIXME
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

describe("MoveModal personal collections", () => {
  const personalCollection = createMockCollection({
    id: 21,
    name: "Bobby Tables's Personal Collection",
    location: "/",
    personal_owner_id: 1,
    is_personal: true,
    can_write: true,
  });
  const personalSubCollection = createMockCollection({
    id: 22,
    name: "14122C",
    location: "/21/",
    parent_id: 21,
    can_write: true,
  });

  it("offers a sub-collection of the personal collection as a destination (metabase#14122)", async () => {
    // Registered first, so it answers before the shared lookup that only knows collection1
    setupCollectionByIdEndpoint({
      collections: [collection1, personalCollection, personalSubCollection],
    });
    setupEndpoints();
    setupCollectionItemsEndpoint({
      collection: personalCollection,
      collectionItems: [
        createMockCollectionItem({
          id: 22,
          model: "collection",
          name: personalSubCollection.name,
          location: "/21/",
          here: ["collection"],
          below: ["collection"],
          can_write: true,
        }),
      ],
    });
    setupCollectionItemsEndpoint({
      collection: personalSubCollection,
      collectionItems: [],
    });

    renderWithProviders(
      <MoveModal
        title="Move question"
        onClose={jest.fn()}
        onMove={jest.fn()}
        movingItem={movingCard}
        canMoveToDashboard
      />,
      {
        storeInitialState: {
          currentUser: createMockUser({ id: 1, personal_collection_id: 21 }),
        },
      },
    );

    await userEvent.click(await findPickerItem(personalCollection.name));
    await userEvent.click(await findPickerItem(personalSubCollection.name));

    expect(getPickerItem(personalSubCollection.name)).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "Move" })).toBeEnabled();
  });
});

/** Picker items are named by their icon, then their own name, then their location */
function pickerItemName(name: string) {
  return new RegExp(`^[\\w-]+ icon ${name}`);
}

function getPickerItem(name: string) {
  return screen.getByRole("link", { name: pickerItemName(name) });
}

function findPickerItem(name: string) {
  return screen.findByRole("link", { name: pickerItemName(name) });
}

function queryPickerItem(name: string) {
  return screen.queryByRole("link", { name: pickerItemName(name) });
}

describe("BulkMoveModal (metabase#45248)", () => {
  const SEARCH_TEXT = "collection";
  // Tells search results apart from the recents they replace
  const SEARCH_RESULT_LOCATION = "Search result location";

  const anotherCollection = createMockCollection({
    id: 31,
    name: "Another collection",
    location: "/",
    can_write: true,
  });
  const outerCollection = createMockCollection({
    id: 32,
    name: "Outer collection 1",
    location: "/",
    can_write: true,
  });
  const innerCollection = createMockCollection({
    id: 33,
    name: "Inner collection 1",
    location: "/32/",
    parent_id: 32,
    can_write: true,
  });
  const secondInnerCollection = createMockCollection({
    id: 34,
    name: "Inner collection 2",
    location: "/32/",
    parent_id: 32,
    can_write: true,
  });
  const otherOuterCollection = createMockCollection({
    id: 35,
    name: "Outer collection 2",
    location: "/",
    can_write: true,
  });
  const rootCollections = [
    anotherCollection,
    collection1,
    outerCollection,
    otherOuterCollection,
  ];
  const allCollections = [
    ...rootCollections,
    innerCollection,
    secondInnerCollection,
  ];

  // The API sends `effective_location` with recents and search results, and the
  // picker reads it to find a moving collection's descendants, but the
  // RecentCollectionItem and SearchResult types do not declare it.
  function withEffectiveLocation(collection: Collection) {
    return { effective_location: collection.location ?? undefined };
  }

  function toCollectionItem(collection: Collection): CollectionItem {
    return createMockCollectionItem({
      id: Number(collection.id),
      name: collection.name,
      model: "collection",
      location: collection.location ?? undefined,
      here: ["collection"],
      below: ["collection"],
      can_write: true,
      collection_id: null,
    });
  }

  const ordersQuestion = createMockCollectionItem({
    id: 1,
    name: "Orders",
    model: "card",
    collection_id: null,
  });

  function setupBulkMove({
    selectedItems,
  }: {
    selectedItems: CollectionItem[];
  }) {
    mockGetBoundingClientRect();
    setupDatabasesEndpoints([]);
    setupCollectionsEndpoints({ collections: allCollections, rootCollection });
    setupCollectionByIdEndpoint({ collections: allCollections });
    setupRootCollectionItemsEndpoint({
      rootCollectionItems: rootCollections.map(toCollectionItem),
    });
    setupCollectionItemsEndpoint({
      collection: outerCollection,
      collectionItems: [innerCollection, secondInnerCollection].map(
        toCollectionItem,
      ),
    });
    allCollections
      .filter((collection) => collection.id !== outerCollection.id)
      .forEach((collection) =>
        setupCollectionItemsEndpoint({ collection, collectionItems: [] }),
      );
    setupRecentViewsAndSelectionsEndpoints(
      [
        { collection: innerCollection, parentName: outerCollection.name },
        { collection: otherOuterCollection, parentName: "Our analytics" },
      ].map(({ collection, parentName }) => ({
        ...createMockRecentCollectionItem({
          id: Number(collection.id),
          name: collection.name,
          model: "collection",
          can_write: true,
          parent_collection: {
            id: collection.parent_id ?? null,
            name: parentName,
          },
        }),
        ...withEffectiveLocation(collection),
      })),
      ["selections", "views"],
    );
    fetchMock.get("path:/api/search", (call) => {
      const query = new URL(call.url).searchParams.get("q");
      const data =
        query === SEARCH_TEXT
          ? [innerCollection, secondInnerCollection, otherOuterCollection].map(
              (collection) => ({
                ...createMockSearchResult({
                  id: Number(collection.id),
                  name: collection.name,
                  model: "collection",
                  can_write: true,
                  collection: createMockCollection({
                    id: 1,
                    name: SEARCH_RESULT_LOCATION,
                  }),
                }),
                ...withEffectiveLocation(collection),
              }),
            )
          : [];
      return { data, total: data.length };
    });
    fetchMock.get("path:/api/user/recipients", { data: [] });

    renderWithProviders(
      <BulkMoveModal
        onClose={jest.fn()}
        onMove={jest.fn()}
        selectedItems={selectedItems}
        initialCollectionId="root"
      />,
      { storeInitialState: { currentUser: createMockUser() } },
    );
  }

  async function openRecents() {
    expect(await findPickerItem(otherOuterCollection.name)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Recent items"));
  }

  /** Recents and search results, which load in place of the collection tree */
  async function findResultTexts() {
    const results = await screen.findAllByTestId("result-item");
    return results.map((result) => result.textContent);
  }

  it("hides a moving collection's descendants in the tree, recents and search", async () => {
    setupBulkMove({ selectedItems: [toCollectionItem(outerCollection)] });

    expect(await findPickerItem(otherOuterCollection.name)).toBeInTheDocument();
    expect(getPickerItem(outerCollection.name)).toHaveAttribute(
      "data-disabled",
    );
    expect(queryPickerItem("Inner collection")).not.toBeInTheDocument();

    await openRecents();
    expect(await findResultTexts()).toEqual([
      expect.stringContaining(otherOuterCollection.name),
    ]);

    await userEvent.type(
      within(screen.getByTestId("entity-picker-modal")).getByPlaceholderText(
        "Search…",
      ),
      SEARCH_TEXT,
    );
    expect(await screen.findAllByText(SEARCH_RESULT_LOCATION)).not.toHaveLength(
      0,
    );
    expect(await findResultTexts()).toEqual([
      `${otherOuterCollection.name} ${SEARCH_RESULT_LOCATION}`,
    ]);
  });

  it("hides a moving collection's descendants in recents when questions move with it", async () => {
    setupBulkMove({
      selectedItems: [ordersQuestion, toCollectionItem(outerCollection)],
    });

    await openRecents();
    expect(await findResultTexts()).toEqual([
      expect.stringContaining(otherOuterCollection.name),
    ]);
  });

  it("disables every moving collection and starts in the current collection", async () => {
    setupBulkMove({
      selectedItems: [
        ordersQuestion,
        toCollectionItem(anotherCollection),
        toCollectionItem(collection1),
      ],
    });

    expect(await findPickerItem(collection1.name)).toHaveAttribute(
      "data-disabled",
    );
    expect(getPickerItem(anotherCollection.name)).toHaveAttribute(
      "data-disabled",
    );
    expect(getPickerItem(otherOuterCollection.name)).not.toHaveAttribute(
      "data-disabled",
    );
    expect(getPickerItem("Our analytics")).toHaveAttribute(
      "data-active",
      "true",
    );
  });
});

describe("MoveModal search", () => {
  const NO_COLLECTION_PERSONAL_COLLECTION = createMockCollection({
    id: 8,
    name: "No Collection Tableton's Personal Collection",
    personal_owner_id: 3,
    is_personal: true,
    location: "/",
    can_write: true,
  });
  const SECOND_COLLECTION = createMockCollection({
    id: 10,
    name: "Second collection",
    location: `/${FIRST_COLLECTION_ID}/`,
    can_write: true,
  });

  const THIRD_COLLECTION = createMockCollection({
    id: 13,
    name: "Third collection",
    location: `/${FIRST_COLLECTION_ID}/10/`,
    can_write: true,
  });

  const createCollectionSearchResult = (
    id: number,
    name: string,
    parent: Collection,
  ) =>
    createMockSearchResult({
      id,
      name,
      model: "collection",
      can_write: true,
      collection: parent,
    });

  const createPersonalCollectionSearchResults = (
    namePrefix: string,
    parent: Collection,
    firstId: number,
  ) => [
    createCollectionSearchResult(firstId, `${namePrefix} 1`, parent),
    createCollectionSearchResult(firstId + 1, `${namePrefix} 2`, parent),
  ];

  const toCollectionItem = (collection: Collection) =>
    createMockCollectionItem({
      id: Number(collection.id),
      name: collection.name,
      model: "collection",
      can_write: true,
      location: collection.location ?? "/",
      here: ["collection"],
      below: ["collection"],
    });

  const SEARCH_RESULTS = [
    createCollectionSearchResult(FIRST_COLLECTION_ID, "First collection", ROOT),
    createCollectionSearchResult(
      Number(SECOND_COLLECTION.id),
      "Second collection",
      FIRST_COLLECTION,
    ),
    createCollectionSearchResult(
      Number(THIRD_COLLECTION.id),
      "Third collection",
      SECOND_COLLECTION,
    ),
    ...createPersonalCollectionSearchResults(
      "Normal personal collection",
      NORMAL_PERSONAL_COLLECTION,
      700,
    ),
  ];

  const ADMIN_SEARCH_RESULTS = [
    ...createPersonalCollectionSearchResults(
      "Admin personal collection",
      ADMIN_PERSONAL_COLLECTION,
      500,
    ),
    ...createPersonalCollectionSearchResults(
      "Normal personal collection",
      NORMAL_PERSONAL_COLLECTION,
      700,
    ),
    ...createPersonalCollectionSearchResults(
      "No collection personal collection",
      NO_COLLECTION_PERSONAL_COLLECTION,
      800,
    ),
  ];

  type SearchSetupOpts = {
    currentUser?: User;
    searchResults?: SearchResult[];
  };

  const setupSearch = async ({
    currentUser = NORMAL_USER,
    searchResults = SEARCH_RESULTS,
  }: SearchSetupOpts = {}) => {
    process.env.OVERSCAN = "20";
    mockGetBoundingClientRect();
    const collections = [
      ROOT,
      FIRST_COLLECTION,
      SECOND_COLLECTION,
      NORMAL_PERSONAL_COLLECTION,
      ADMIN_PERSONAL_COLLECTION,
      NO_COLLECTION_PERSONAL_COLLECTION,
    ];

    setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
    setupDatabasesEndpoints([]);
    setupCollectionsEndpoints({ collections, rootCollection: ROOT });
    setupCollectionByIdEndpoint({ collections });
    setupRootCollectionItemsEndpoint({
      rootCollectionItems: [toCollectionItem(FIRST_COLLECTION)],
    });
    setupCollectionItemsEndpoint({
      collection: FIRST_COLLECTION,
      collectionItems: [toCollectionItem(SECOND_COLLECTION)],
    });
    [
      SECOND_COLLECTION,
      NORMAL_PERSONAL_COLLECTION,
      ADMIN_PERSONAL_COLLECTION,
      NO_COLLECTION_PERSONAL_COLLECTION,
    ].forEach((collection) =>
      setupCollectionItemsEndpoint({
        collection,
        collectionItems: searchResults
          .filter((result) => result.collection.id === collection.id)
          .map((result) =>
            toCollectionItem(
              createMockCollection({ id: result.id, name: result.name }),
            ),
          ),
      }),
    );
    setupSearchEndpoints(searchResults, undefined, { filterByScope: true });
    fetchMock.get("path:/api/user/recipients", { data: [] });

    const onMove = jest.fn();
    renderWithProviders(
      <MoveModal
        title="Move question"
        onClose={jest.fn()}
        onMove={onMove}
        movingItem={{
          id: 1,
          name: "Orders",
          model: "card",
          can_write: true,
          collection: { id: "root", name: "Our analytics" },
        }}
        canMoveToDashboard
      />,
      { storeInitialState: createMockState({ currentUser }) },
    );
    await waitForLoaderToBeRemoved();
    return { onMove };
  };

  const openFirstCollection = async () => {
    await userEvent.click(await screen.findByText("First collection"));
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /First collection/ }),
      ).toHaveAttribute("data-active", "true"),
    );
  };

  it("should move to a collection picked from the search of the current collection", async () => {
    const { onMove } = await setupSearch();

    await openFirstCollection();
    await typeSearchText("second");
    expect(getScopeRadio("First collection")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(FIRST_COLLECTION_ID),
    );
    expect(getLastSearchParams().getAll("models")).toEqual([
      "collection",
      "dashboard",
    ]);
    await userEvent.click(await findSearchResult("Second collection"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({
      id: SECOND_COLLECTION.id,
      model: "collection",
    });
  });

  it("should move to a collection picked from the search everywhere", async () => {
    const { onMove } = await setupSearch();

    await openFirstCollection();
    await typeSearchText("second");
    await userEvent.click(getScopeRadio("Everywhere"));
    expect(getScopeRadio("Everywhere")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBeNull();
    await userEvent.click(await findSearchResult("Second collection"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({
      id: SECOND_COLLECTION.id,
      model: "collection",
    });
  });

  it("should search the current collection for a normal user", async () => {
    await setupSearch();

    await openFirstCollection();
    await typeSearchText("collection");
    expect(getScopeRadio("First collection")).toBeChecked();
    // a scoped search also returns the scoped collection and nested collections
    await expectSearchResults([
      "First collection",
      "Second collection",
      "Third collection",
    ]);

    await userEvent.click(getScopeRadio("Everywhere"));
    expect(getLastSearchParams().get("collection")).toBeNull();
    await expectSearchResults([
      "First collection",
      "Second collection",
      "Third collection",
      "Normal personal collection 1",
      "Normal personal collection 2",
    ]);

    await userEvent.click(getScopeRadio("First collection"));
    expect(getScopeRadio("First collection")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(FIRST_COLLECTION_ID),
    );
    await expectSearchResults([
      "First collection",
      "Second collection",
      "Third collection",
    ]);

    await userEvent.click(getRootItem(/Robert Tableton's Personal/));
    await typeSearchText("personal collection 1");
    expect(getScopeRadio(/Robert Tableton/)).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(NORMAL_PERSONAL_COLLECTION.id),
    );
    await expectSearchResults(["Normal personal collection 1"]);
  });

  it("should only search everywhere from all personal collections", async () => {
    await setupSearch({
      currentUser: ADMIN_USER,
      searchResults: ADMIN_SEARCH_RESULTS,
    });

    await userEvent.click(await screen.findByText("All personal collections"));
    expect(
      await screen.findByText("Robert Tableton's Personal Collection"),
    ).toBeInTheDocument();
    await typeSearchText("personal collection");
    expect(getScopeRadio("Everywhere")).toBeChecked();
    expect(
      getSearchScopeSelector().queryByRole("radio", {
        name: "All personal collections",
      }),
    ).not.toBeInTheDocument();
    expect(getSearchScopeSelector().getAllByRole("radio")).toHaveLength(1);

    await expectSearchResults([
      "Admin personal collection 1",
      "Admin personal collection 2",
      "Normal personal collection 1",
      "Normal personal collection 2",
      "No collection personal collection 1",
      "No collection personal collection 2",
    ]);
    expect(getLastSearchParams().get("collection")).toBeNull();
  });
});
