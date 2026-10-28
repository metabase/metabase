import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupMostRecentlyViewedDashboard,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/common/collections/constants";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import { checkNotNull, isNotNull } from "metabase/utils/types";
import type {
  BaseEntityId,
  Card,
  Collection,
  Dashboard,
  RecentItem,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockRecentCollectionItem,
  createMockSearchResult,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AddToDashSelectDashModal } from "./AddToDashSelectDashModal";

const CURRENT_USER = createMockUser({
  id: getNextId(),
  personal_collection_id: getNextId(),
  is_superuser: true,
});

const DASHBOARD = createMockDashboard({
  id: getNextId(),
  name: "Test dashboard",
  collection_id: 2,
  model: "dashboard",
});

const DASHBOARD_AT_ROOT = createMockDashboard({
  id: getNextId(),
  name: "Dashboard at root",
  model: "dashboard",
});

const COLLECTION = createMockCollection({
  id: getNextId(),
  name: "Collection",
  can_write: true,
  is_personal: false,
  location: "/",
  effective_location: "/",
});

const SUBCOLLECTION = createMockCollection({
  id: getNextId(),
  name: "Nested collection",
  can_write: true,
  is_personal: false,
  location: `/${COLLECTION.id}/`,
  effective_location: `/${COLLECTION.id}/`,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id ?? undefined,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER.id,
  can_write: true,
  is_personal: true,
  location: "/",
  effective_location: "/",
});

const PERSONAL_SUBCOLLECTION = createMockCollection({
  id: getNextId(),
  name: "Nested personal collection",
  can_write: true,
  is_personal: true,
  location: `/${PERSONAL_COLLECTION.id}/`,
  effective_location: `/${PERSONAL_COLLECTION.id}/`,
});

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const COLLECTIONS = [
  ROOT_COLLECTION,
  COLLECTION,
  SUBCOLLECTION,
  PERSONAL_COLLECTION,
  PERSONAL_SUBCOLLECTION,
];

const CARD_IN_ROOT_COLLECTION = createMockCard({
  id: getNextId(),
  name: "Model Uno",
  type: "model",
});

const CARD_IN_PUBLIC_COLLECTION = createMockCard({
  id: getNextId(),
  name: "Model Uno",
  type: "model",
  collection: COLLECTION,
});

const CARD_IN_PUBLIC_SUBCOLLECTION = createMockCard({
  id: getNextId(),
  name: "Model Uno",
  type: "model",
  // Unjustified type cast. FIXME
  collection_id: SUBCOLLECTION.id as number,
  collection: SUBCOLLECTION,
});

const CARD_IN_PERSONAL_COLLECTION = createMockCard({
  id: getNextId(),
  name: "Card in a personal collection",
  type: "model",
  collection: PERSONAL_COLLECTION,
  // Unjustified type cast. FIXME
  collection_id: PERSONAL_COLLECTION.id as number,
});

const DASHBOARD_RESULT_IN_PUBLIC_COLLECTION = createMockSearchResult({
  id: getNextId(),
  name: "dashboard in public collection",
  model: "dashboard",
  collection: COLLECTION,
});

const DASHBOARD_RESULT_IN_PERSONAL_COLLECTION = createMockSearchResult({
  id: getNextId(),
  name: "dashboard in personal collection",
  model: "dashboard",
  collection: PERSONAL_COLLECTION,
});

const LIBRARY_COLLECTION = createMockCollection({
  id: getNextId(),
  name: "Library",
  type: "library",
  can_write: false,
  location: "/",
  effective_location: "/",
});

const LIBRARY_DASHBOARDS_COLLECTION_ID = getNextId();
const LIBRARY_DASHBOARDS_COLLECTION = createMockCollection({
  id: LIBRARY_DASHBOARDS_COLLECTION_ID,
  name: "Curated dashboards",
  type: "library-dashboards",
  can_write: true,
  location: `/${LIBRARY_COLLECTION.id}/`,
  effective_location: `/${LIBRARY_COLLECTION.id}/`,
});

const LIBRARY_METRICS_COLLECTION = createMockCollection({
  id: getNextId(),
  name: "Curated metrics",
  type: "library-metrics",
  can_write: true,
  location: `/${LIBRARY_COLLECTION.id}/`,
  effective_location: `/${LIBRARY_COLLECTION.id}/`,
});

const COLLECTIONS_WITH_LIBRARY = [
  ...COLLECTIONS,
  LIBRARY_COLLECTION,
  LIBRARY_DASHBOARDS_COLLECTION,
  LIBRARY_METRICS_COLLECTION,
];

const LIBRARY_DASHBOARD = createMockDashboard({
  id: getNextId(),
  name: "Revenue overview",
  collection: LIBRARY_DASHBOARDS_COLLECTION,
  collection_id: LIBRARY_DASHBOARDS_COLLECTION_ID,
  model: "dashboard",
});

const LIBRARY_METRIC = createMockCard({
  id: getNextId(),
  name: "Library metric",
  type: "metric",
  collection: LIBRARY_METRICS_COLLECTION,
});

const RECENT_LIBRARY_DASHBOARD = createMockRecentCollectionItem({
  id: getNextId(),
  name: "Recent library dashboard",
  model: "dashboard",
  parent_collection: {
    id: LIBRARY_DASHBOARDS_COLLECTION_ID,
    name: LIBRARY_DASHBOARDS_COLLECTION.name,
    type: "library-dashboards",
  },
});

const RECENT_REGULAR_DASHBOARD = createMockRecentCollectionItem({
  id: getNextId(),
  name: "Recent regular dashboard",
  model: "dashboard",
  parent_collection: { id: null, name: "Our analytics" },
});

// no `collection` and `collection_id` means it's in the root collection
const dashboardInRootCollection = createMockDashboard({
  id: getNextId(),
  name: "Dashboard in root collection",
  model: "dashboard",
});

const dashboardInPublicSubcollection = createMockDashboard({
  id: getNextId(),
  name: "Dashboard in public subcollection",
  collection: SUBCOLLECTION,
  // Unjustified type cast. FIXME
  collection_id: SUBCOLLECTION.id as number,
  model: "dashboard",
});

const dashboardInPersonalSubcollection = createMockDashboard({
  id: getNextId(),
  name: "Dashboard in personal subcollection",
  collection: PERSONAL_SUBCOLLECTION,
  // Unjustified type cast. FIXME
  collection_id: PERSONAL_SUBCOLLECTION.id as number,
  model: "dashboard",
});

const dashboardInPersonalCollection = createMockDashboard({
  id: getNextId(),
  name: "Dashboard in personal collection",
  // Unjustified type cast. FIXME
  collection_id: PERSONAL_COLLECTION.id as number,
  model: "dashboard",
});

const DASHBOARDS = [
  DASHBOARD,
  DASHBOARD_AT_ROOT,
  dashboardInPublicSubcollection,
  dashboardInPersonalCollection,
  dashboardInPersonalSubcollection,
  dashboardInRootCollection,
];

const getCollectionParentId = (collection: Collection) => {
  const pathFromRoot =
    collection.location?.split("/").filter(Boolean).map(Number) ?? [];

  if (collection.id === "root") {
    return null;
  }

  if (collection.is_personal && collection.location === "/") {
    return null;
  }

  if (pathFromRoot.length === 0) {
    return "root";
  } else {
    return pathFromRoot[pathFromRoot.length - 1];
  }
};

interface SetupOpts {
  card?: Card;
  collections?: Collection[];
  error?: string;
  mostRecentlyViewedDashboard?: Dashboard;
  waitForContent?: boolean;
  searchResults?: SearchResult[];
  recents?: RecentItem[];
  hasLibraryFeature?: boolean;
}

const setup = async ({
  card = CARD_IN_ROOT_COLLECTION,
  collections = COLLECTIONS,
  mostRecentlyViewedDashboard = undefined,
  error,
  waitForContent = true,
  searchResults = [],
  recents = [],
  hasLibraryFeature = false,
}: SetupOpts = {}) => {
  mockGetBoundingClientRect();
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ library: hasLibraryFeature }),
  });
  if (hasLibraryFeature) {
    setupEnterpriseOnlyPlugin("library");
    setupLibraryEndpoints(false);
  }
  const dashboards = Array.from(
    new Set(
      [...DASHBOARDS, LIBRARY_DASHBOARD, mostRecentlyViewedDashboard].filter(
        isNotNull,
      ),
    ),
  );

  setupCollectionsEndpoints({ collections, rootCollection: ROOT_COLLECTION });
  setupCollectionByIdEndpoint({ collections, error });
  setupRecentViewsAndSelectionsEndpoints(recents);
  setupMostRecentlyViewedDashboard(mostRecentlyViewedDashboard);
  setupSearchEndpoints(searchResults);
  setupDatabasesEndpoints([]);

  collections.forEach((collection) => {
    setupCollectionItemsEndpoint({
      collection,
      collectionItems: [
        ...collections
          .filter((c) => getCollectionParentId(c) === collection.id)
          .map((c) =>
            createMockCollectionItem({
              ...c,
              // Unjustified type cast. FIXME
              id: c.id as number,
              // Unjustified type cast. FIXME
              entity_id: c.entity_id as BaseEntityId,
              effective_location: c.location || "/",
              location: c.location || "/",
              type: c.type,
              model: "collection",
              here: ["collection", "dashboard"],
              below: ["collection", "dashboard"],
            }),
          ),
        ...dashboards
          .filter(
            (d) =>
              (collection.id === "root" && !d.collection_id) ||
              d.collection_id === collection.id,
          )
          .map((d) =>
            createMockCollectionItem({
              ...d,
              // Unjustified type cast. FIXME
              id: d.id as number,
              model: "dashboard",
            }),
          ),
      ],
    });
  });

  dashboards.forEach((dashboard) => {
    fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  });

  fetchMock.get(`path:/api/user/recipients`, { data: [] });

  const onChangeLocation = jest.fn();

  renderWithProviders(
    <Route
      path="/"
      element={
        <AddToDashSelectDashModal
          card={card}
          onChangeLocation={onChangeLocation}
          onClose={() => undefined}
        />
      }
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: CURRENT_USER,
        settings,
      }),
    },
  );

  if (waitForContent) {
    await waitForLoaderToBeRemoved();
  }

  return { onChangeLocation };
};

describe("AddToDashSelectDashModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reinitialize();
  });

  describe("library dashboards", () => {
    const setupWithLibrary = (opts: SetupOpts = {}) =>
      setup({
        hasLibraryFeature: true,
        collections: COLLECTIONS_WITH_LIBRARY,
        ...opts,
      });

    it("should keep library dashboards from a non-library question, and explain why the Library is disabled", async () => {
      await setupWithLibrary({
        mostRecentlyViewedDashboard: LIBRARY_DASHBOARD,
        recents: [RECENT_LIBRARY_DASHBOARD, RECENT_REGULAR_DASHBOARD],
      });

      await assertPath([ROOT_COLLECTION]);
      expect(await findPickerItem(LIBRARY_COLLECTION.name)).toHaveAttribute(
        "data-disabled",
        "true",
      );
      expect(
        screen.queryByText(LIBRARY_DASHBOARD.name),
      ).not.toBeInTheDocument();
      expect(
        fetchMock.callHistory.called(
          `path:/api/dashboard/${LIBRARY_DASHBOARD.id}`,
        ),
      ).toBe(false);

      await userEvent.hover(await findPickerItem(LIBRARY_COLLECTION.name));
      expect(
        await screen.findByRole("tooltip", {
          name: "Only Library questions can be added to Library dashboards",
        }),
      ).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Recent items"));
      expect(
        await screen.findByText(RECENT_REGULAR_DASHBOARD.name),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(RECENT_LIBRARY_DASHBOARD.name),
      ).not.toBeInTheDocument();
    });

    it("should offer library dashboards to a library metric", async () => {
      await setupWithLibrary({
        card: LIBRARY_METRIC,
        mostRecentlyViewedDashboard: LIBRARY_DASHBOARD,
        recents: [RECENT_LIBRARY_DASHBOARD, RECENT_REGULAR_DASHBOARD],
      });

      // the picker loads its preselected dashboard to build the path to it
      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            `path:/api/dashboard/${LIBRARY_DASHBOARD.id}`,
          ),
        ).toBe(true);
      });

      await userEvent.click(await screen.findByText("Recent items"));
      expect(
        await screen.findByText(RECENT_LIBRARY_DASHBOARD.name),
      ).toBeInTheDocument();
      expect(
        screen.getByText(RECENT_REGULAR_DASHBOARD.name),
      ).toBeInTheDocument();
    });
  });

  it("should show the modal while loading", async () => {
    await setup({
      waitForContent: false,
      mostRecentlyViewedDashboard: DASHBOARD,
    });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("should render dashboards when opening the root collection (public collection)", async () => {
    await setup();

    expect(
      await screen.findByRole("link", {
        name: new RegExp(DASHBOARD_AT_ROOT.name),
      }),
    ).toBeInTheDocument();
  });

  it("should render dashboards when opening public subcollections", async () => {
    await setup();

    await clickPickerItem(COLLECTION.name);
    await clickPickerItem(SUBCOLLECTION.name);

    expect(
      await findPickerItem(dashboardInPublicSubcollection.name),
    ).toBeInTheDocument();
  });

  it("should render dashboards when opening personal collections", async () => {
    await setup();
    await clickPickerItem(PERSONAL_COLLECTION.name);

    expect(
      await findPickerItem(dashboardInPersonalCollection.name),
    ).toBeInTheDocument();
  });

  it("should render dashboards when opening personal subcollections", async () => {
    await setup();

    await clickPickerItem(PERSONAL_COLLECTION.name);
    await clickPickerItem(PERSONAL_SUBCOLLECTION.name);

    expect(
      await findPickerItem(dashboardInPersonalSubcollection.name),
    ).toBeInTheDocument();
  });

  describe("when there is a recently visited dashboard", () => {
    it("should preselect last visited dashboard in the picker", async () => {
      await setup({
        mostRecentlyViewedDashboard: DASHBOARD,
      });

      const dashboardCollection = checkNotNull(
        COLLECTIONS.find(
          (collection) => collection.id === DASHBOARD.collection_id,
        ),
      );

      await screen.findByText(/add this model to a dashboard/i);

      await assertPath([dashboardCollection]);
      expect(await findPickerItem(DASHBOARD.name)).toHaveAttribute(
        "data-active",
        "true",
      );
    });

    it("should pre-select dashboard in the root collection", async () => {
      await setup({
        mostRecentlyViewedDashboard: DASHBOARD_AT_ROOT,
      });

      await assertPath([ROOT_COLLECTION]);

      expect(await findPickerItem(DASHBOARD_AT_ROOT.name)).toHaveAttribute(
        "data-active",
        "true",
      );
    });

    it("should pre-select dashboard if the question is in a public collection", async () => {
      await setup({
        mostRecentlyViewedDashboard: dashboardInPublicSubcollection,
      });

      await assertPath([ROOT_COLLECTION, COLLECTION, SUBCOLLECTION]);

      expect(
        await findPickerItem(dashboardInPublicSubcollection.name),
      ).toHaveAttribute("data-active", "true");
    });

    it("should select the question's collection if the question is in a personal collection, but the dashboard is in a public collection", async () => {
      await setup({
        card: CARD_IN_PERSONAL_COLLECTION,
        mostRecentlyViewedDashboard: dashboardInPublicSubcollection,
      });

      expect(await findPickerItem(PERSONAL_COLLECTION.name)).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(
        screen.queryByText(dashboardInPublicSubcollection.name),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(ROOT_COLLECTION.name)).not.toBeInTheDocument();
    });

    it("should pre-select recently visited personal dashboard if the question is in a public collection", async () => {
      await setup({
        mostRecentlyViewedDashboard: dashboardInPersonalSubcollection,
      });

      await assertPath([
        ROOT_COLLECTION,
        PERSONAL_COLLECTION,
        PERSONAL_SUBCOLLECTION,
      ]);

      // dashboard item
      expect(
        await screen.findByText(dashboardInPersonalSubcollection.name),
      ).toBeInTheDocument();
    });

    it("should pre-select personal dashboard if the question is in a personal collection", async () => {
      await setup({
        card: CARD_IN_PERSONAL_COLLECTION,
        mostRecentlyViewedDashboard: dashboardInPersonalSubcollection,
      });

      await assertPath([PERSONAL_COLLECTION, PERSONAL_SUBCOLLECTION]);

      // dashboard item
      expect(
        await screen.findByText(dashboardInPersonalSubcollection.name),
      ).toBeInTheDocument();
    });
  });

  describe("when user didn't visit any dashboard during last 24hrs", () => {
    it("should default to the card path", async () => {
      await setup({
        card: CARD_IN_PUBLIC_SUBCOLLECTION,
      });

      await expectActiveItem(ROOT_COLLECTION.name);
      await expectActiveItem(COLLECTION.name);
      await expectActiveItem(SUBCOLLECTION.name);
    });

    it("should not render public collections when the question is in a personal collection", async () => {
      await setup({
        card: CARD_IN_PERSONAL_COLLECTION,
      });

      expect(
        await findPickerItem(PERSONAL_COLLECTION.name),
      ).toBeInTheDocument();

      expect(
        await findPickerItem(PERSONAL_SUBCOLLECTION.name),
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: new RegExp(ROOT_COLLECTION.name),
        }),
      ).not.toBeInTheDocument();
    });

    it("should render public and personal collections when the question is in a public collection", async () => {
      await setup({
        card: CARD_IN_PUBLIC_COLLECTION,
      });

      expect(
        await findPickerItem(PERSONAL_COLLECTION.name),
      ).toBeInTheDocument();

      expect(await findPickerItem(ROOT_COLLECTION.name)).toBeInTheDocument();
    });

    describe("question is in a public collection", () => {
      it("should render all collections", async () => {
        await setup({
          card: CARD_IN_PUBLIC_COLLECTION,
        });

        await assertPath([ROOT_COLLECTION, COLLECTION]);
        expect(
          screen.queryByText(/my personal collection/),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("search dashboards", () => {
    // since filtering is done on the backend, the only meaningful test is to check the query params
    it("when adding a personal question, should send a personal-only query param", async () => {
      await setup({
        card: CARD_IN_PERSONAL_COLLECTION,
        searchResults: [
          DASHBOARD_RESULT_IN_PUBLIC_COLLECTION,
          DASHBOARD_RESULT_IN_PERSONAL_COLLECTION,
        ],
      });

      const typedText = "dash";

      await userEvent.type(
        await screen.findByPlaceholderText(/search/i),
        typedText,
      );

      await waitForLoaderToBeRemoved();
      await screen.findAllByTestId("result-item");

      const call = fetchMock.callHistory.lastCall("path:/api/search");
      const urlObject = new URL(checkNotNull(call?.request?.url));
      expect(urlObject.pathname).toEqual("/api/search");
      expect(Object.fromEntries(urlObject.searchParams.entries())).toEqual(
        expect.objectContaining({
          context: "entity-picker",
          q: typedText,
          filter_items_in_personal_collection: "only",
        }),
      );
    });

    it("when adding a public question, should not send a personal-only query param", async () => {
      await setup({
        card: CARD_IN_PUBLIC_COLLECTION,
        searchResults: [
          DASHBOARD_RESULT_IN_PUBLIC_COLLECTION,
          DASHBOARD_RESULT_IN_PERSONAL_COLLECTION,
        ],
      });

      const typedText = "dash";

      await userEvent.type(
        await screen.findByPlaceholderText(/search/i),
        typedText,
      );

      await waitForLoaderToBeRemoved();
      await screen.findAllByTestId("result-item");

      const call = fetchMock.callHistory.lastCall("path:/api/search");
      const urlObject = new URL(checkNotNull(call?.request?.url));
      expect(urlObject.pathname).toEqual("/api/search");
      expect(
        Object.keys(Object.fromEntries(urlObject.searchParams.entries())),
      ).not.toContain("filter_items_in_personal_collection");
    });
  });

  describe('"New dashboard" option', () => {
    it('should render "New dashboard" option', async () => {
      await setup();
      expect(
        await screen.findByRole("button", {
          name: /New dashboard/,
        }),
      ).toBeInTheDocument();
    });

    it("should show the create dashboard dialog", async () => {
      // Second part of test requires a value to be "selected"
      const { onChangeLocation } = await setup({
        mostRecentlyViewedDashboard: DASHBOARD_AT_ROOT,
      });

      await userEvent.click(
        await screen.findByRole("button", {
          name: /New dashboard/,
        }),
      );
      // opened CreateDashboardModal
      expect(
        await screen.findByPlaceholderText("My new dashboard"),
      ).toBeInTheDocument();
      expect(
        await screen.findByTestId("create-dashboard-on-the-go"),
      ).toBeInTheDocument();

      // Pressing enter when the create dialog is open should not trigger handleConfirm (metabase#45360);
      await userEvent.keyboard("{enter}");

      expect(onChangeLocation).not.toHaveBeenCalled();
    });
  });
});

async function assertPath(collections: Collection[]) {
  await waitForLoaderToBeRemoved();

  for (const collection of collections) {
    expect(await findPickerItem(collection.name)).toBeInTheDocument();
  }
}

const clickPickerItem = async (item: string) => {
  return userEvent.click(await findPickerItem(item));
};

const findPickerItem = async (item: string) => {
  return screen.findByRole("link", { name: new RegExp(item) });
};

const expectActiveItem = async (itemName: string) =>
  waitFor(() =>
    expect(
      screen.getByRole("link", { name: new RegExp(itemName) }),
    ).toHaveAttribute("data-active", "true"),
  );
