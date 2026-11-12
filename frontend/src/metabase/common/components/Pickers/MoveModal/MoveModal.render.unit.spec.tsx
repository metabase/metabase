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
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { Collection, SearchResult, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockSearchResult,
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
    await expectSearchResults(["Second collection"]);

    await userEvent.click(getScopeRadio("Everywhere"));
    expect(getLastSearchParams().get("collection")).toBeNull();
    await expectSearchResults([
      "First collection",
      "Second collection",
      "Normal personal collection 1",
      "Normal personal collection 2",
    ]);

    await userEvent.click(getScopeRadio("First collection"));
    expect(getScopeRadio("First collection")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(FIRST_COLLECTION_ID),
    );
    await expectSearchResults(["Second collection"]);

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

    await expectSearchResults([
      "Admin personal collection 1",
      "Admin personal collection 2",
      "Normal personal collection 1",
      "Normal personal collection 2",
      "No collection personal collection 1",
      "No collection personal collection 2",
    ]);
    expect(getLastSearchParams().get("collection")).toBeNull();
    expect(getScopeRadio("Everywhere")).toBeChecked();
    expect(
      getSearchScopeSelector().queryByRole("radio", {
        name: "All personal collections",
      }),
    ).not.toBeInTheDocument();
    expect(getSearchScopeSelector().getAllByRole("radio")).toHaveLength(1);
  });
});
