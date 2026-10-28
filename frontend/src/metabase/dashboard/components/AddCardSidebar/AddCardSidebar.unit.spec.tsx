import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/common/collections/constants";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { reinitialize } from "metabase/plugins";
import { checkNotNull } from "metabase/utils/types";
// TODO: Move this to a more suitable location for sharing.
import type { Collection, CollectionItem, Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSearchResult,
  createMockTokenFeatures,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { AddCardSidebar } from "./AddCardSidebar";

const CURRENT_USER_ID = 1;
const PERSONAL_COLLECTION_ID = 100;

const COLLECTION = createMockCollection({
  id: 1,
  name: "Collection",
  can_write: true,
  is_personal: false,
  location: "/",
});

const SUBCOLLECTION = createMockCollection({
  id: 2,
  name: "Nested collection",
  can_write: true,
  is_personal: false,
  location: `/${COLLECTION.id}/`,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: PERSONAL_COLLECTION_ID,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER_ID,
  can_write: true,
  is_personal: true,
  location: "/",
});

const PERSONAL_SUBCOLLECTION = createMockCollection({
  id: PERSONAL_COLLECTION_ID + 1,
  name: "Nested personal collection",
  can_write: true,
  is_personal: true,
  location: `/${PERSONAL_COLLECTION.id}/`,
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

const LIBRARY_COLLECTION = createMockCollection({
  id: 50,
  name: "Library",
  type: "library",
  is_library_root: true,
  can_write: false,
  location: "/",
});

const LIBRARY_METRICS_COLLECTION = createMockCollection({
  id: 51,
  name: "Metrics",
  type: "library-metrics",
  is_library_root: true,
  can_write: true,
  location: `/${LIBRARY_COLLECTION.id}/`,
});

const LIBRARY_METRICS_SUBCOLLECTION = createMockCollection({
  id: 52,
  name: "Finance metrics",
  type: "library-metrics",
  can_write: true,
  location: `/${LIBRARY_COLLECTION.id}/${LIBRARY_METRICS_COLLECTION.id}/`,
});

const LIBRARY_DASHBOARDS_COLLECTION = createMockCollection({
  id: 53,
  name: "Dashboards",
  type: "library-dashboards",
  is_library_root: true,
  can_write: true,
  location: `/${LIBRARY_COLLECTION.id}/`,
});

const LIBRARY_COLLECTIONS = [
  ...COLLECTIONS,
  LIBRARY_COLLECTION,
  LIBRARY_METRICS_COLLECTION,
  LIBRARY_METRICS_SUBCOLLECTION,
  LIBRARY_DASHBOARDS_COLLECTION,
];

const LIBRARY_EMPTY_STATE_MESSAGE =
  "Only metrics from the Library can be added to this dashboard";

interface SetupOpts {
  collections: Collection[];
  collectionItems?: CollectionItem[];
  itemsCollection?: Collection;
  dashboard?: Dashboard;
  canCreateQueries?: boolean;
  canCreateNativeQueries?: boolean;
  hasLibraryFeature?: boolean;
}

async function setup({
  collections,
  collectionItems = [],
  itemsCollection,
  dashboard = createMockDashboard({
    collection: ROOT_COLLECTION,
  }),
  canCreateQueries,
  canCreateNativeQueries,
  hasLibraryFeature = false,
}: SetupOpts) {
  setupCollectionsEndpoints({
    collections,
  });
  setupCollectionItemsEndpoint({
    collection:
      itemsCollection ??
      createMockCollection(checkNotNull(dashboard.collection)),
    collectionItems,
  });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ library: hasLibraryFeature }),
  });
  if (hasLibraryFeature) {
    setupEnterpriseOnlyPlugin("library");
  }

  renderWithProviders(
    <MockDashboardContext
      dashboardId={dashboard.id}
      navigateToNewCardFromDashboard={null}
    >
      <AddCardSidebar />
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({
          id: CURRENT_USER_ID,
          personal_collection_id: PERSONAL_COLLECTION_ID,
          permissions: createMockUserPermissions({
            can_create_queries: canCreateQueries,
            can_create_native_queries: canCreateNativeQueries,
          }),
        }),
        dashboard: createMockDashboardState({
          dashboards: {
            [dashboard.id]: { ...dashboard, dashcards: [] },
          },
          dashboardId: dashboard.id,
        }),
      }),
    },
  );

  await waitFor(() => {
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
}

describe("AddCardSideBar", () => {
  it("should render no items", async () => {
    await setup({
      collections: [],
    });

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  describe("dashboards in the root collection (public collection)", () => {
    const dashboardInRootCollection = createMockDashboard({
      collection: ROOT_COLLECTION,
    });

    it("should hide all personal collections", async () => {
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInRootCollection,
      });

      assertBreadcrumbs([ROOT_COLLECTION]);

      expect(
        screen.getByRole("menuitem", {
          name: COLLECTION.name,
        }),
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("menuitem", {
          name: PERSONAL_COLLECTION.name,
        }),
      ).not.toBeInTheDocument();
    });

    it("should show all questions", async () => {
      const collectionItems = [
        createMockCollectionItem({
          id: getNextId(),
          model: "card",
          name: "question 1",
        }),
        createMockCollectionItem({
          id: getNextId(),
          model: "card",
          name: "question 2",
        }),
      ];
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInRootCollection,
        collectionItems,
      });

      assertBreadcrumbs([ROOT_COLLECTION]);

      collectionItems.forEach((collectionItem) => {
        expect(
          screen.getByRole("menuitem", {
            name: collectionItem.name,
          }),
        ).toBeInTheDocument();
      });
    });

    it("should search questions only in public collections", async () => {
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInRootCollection,
      });

      const typedText = "dashboard";
      await userEvent.type(screen.getByPlaceholderText("Search…"), typedText);
      const baseQuery = {
        models: ["card", "dataset", "metric"],
        offset: 0,
        limit: 50,
      };
      const questionInPublicCollection = createMockSearchResult({
        name: "question in public collection",
        model: "card",
      });
      fetchMock.get({
        url: "path:/api/search",
        query: {
          ...baseQuery,
          q: typedText,
          filter_items_in_personal_collection: "exclude",
        },
        response: {
          data: [questionInPublicCollection],
        },
      });

      expect(
        await screen.findByText(questionInPublicCollection.name),
      ).toBeInTheDocument();
    });
  });

  describe("dashboards in public collections", () => {
    const dashboardInPublicSubcollection = createMockDashboard({
      collection: SUBCOLLECTION,
    });

    it("should show all questions", async () => {
      const collectionItems = [
        createMockCollectionItem({
          id: getNextId(),
          model: "card",
          name: "question 1",
        }),
        createMockCollectionItem({
          id: getNextId(),
          model: "card",
          name: "question 2",
        }),
      ];
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInPublicSubcollection,
        collectionItems,
      });

      assertBreadcrumbs([ROOT_COLLECTION, COLLECTION, SUBCOLLECTION]);

      collectionItems.forEach((collectionItem) => {
        expect(
          screen.getByRole("menuitem", {
            name: collectionItem.name,
          }),
        ).toBeInTheDocument();
      });
    });

    it("should search questions only in public collections", async () => {
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInPublicSubcollection,
      });

      const typedText = "dashboard";
      await userEvent.type(screen.getByPlaceholderText("Search…"), typedText);
      const baseQuery = {
        models: ["card", "dataset", "metric"],
        offset: 0,
        limit: 50,
      };
      const questionInPublicCollection = createMockSearchResult({
        name: "question in public collection",
        model: "card",
      });
      fetchMock.get({
        url: "path:/api/search",
        query: {
          ...baseQuery,
          q: typedText,
          filter_items_in_personal_collection: "exclude",
        },
        response: {
          data: [questionInPublicCollection],
        },
      });

      expect(
        await screen.findByText(questionInPublicCollection.name),
      ).toBeInTheDocument();
    });
  });

  describe("dashboards in personal collections", () => {
    const dashboardInPersonalSubcollection = createMockDashboard({
      collection: PERSONAL_SUBCOLLECTION,
    });

    it("should show all collections", async () => {
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInPersonalSubcollection,
      });

      assertBreadcrumbs([
        ROOT_COLLECTION,
        PERSONAL_COLLECTION,
        PERSONAL_SUBCOLLECTION,
      ]);

      expect(screen.getByText("Nothing here")).toBeInTheDocument();
    });

    it("should show all questions", async () => {
      const collectionItems = [
        createMockCollectionItem({
          id: getNextId(),
          model: "card",
          name: "private question 1",
        }),
        createMockCollectionItem({
          id: getNextId(),
          model: "card",
          name: "private question 2",
        }),
      ];
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInPersonalSubcollection,
        collectionItems,
      });

      assertBreadcrumbs([
        ROOT_COLLECTION,
        PERSONAL_COLLECTION,
        PERSONAL_SUBCOLLECTION,
      ]);

      collectionItems.forEach((collectionItem) => {
        expect(
          screen.getByRole("menuitem", {
            name: collectionItem.name,
          }),
        ).toBeInTheDocument();
      });
    });

    it("should search all questions", async () => {
      await setup({
        collections: COLLECTIONS,
        dashboard: dashboardInPersonalSubcollection,
      });

      const typedText = "dashboard";
      await userEvent.type(screen.getByPlaceholderText("Search…"), typedText);
      const baseQuery = {
        models: ["card", "dataset", "metric"],
        offset: 0,
        limit: 50,
      };
      const questionInPublicCollection = createMockSearchResult({
        id: 1,
        name: "question in public collection",
        model: "card",
      });
      const questionInPersonalCollection = createMockSearchResult({
        id: 2,
        name: "question in personal collection",
        model: "card",
      });
      fetchMock.get({
        url: "path:/api/search",
        query: {
          ...baseQuery,
          q: typedText,
        },
        response: {
          data: [questionInPublicCollection, questionInPersonalCollection],
        },
      });

      expect(
        await screen.findByText(questionInPublicCollection.name),
      ).toBeInTheDocument();
      expect(
        screen.getByText(questionInPersonalCollection.name),
      ).toBeInTheDocument();

      // There's no way to math a URL that a query param is not present
      // with fetch-mock, so we have to assert it manually.
      const call = fetchMock.callHistory.lastCall("path:/api/search");
      const urlObject = new URL(checkNotNull(call?.request?.url));
      expect(urlObject.pathname).toEqual("/api/search");
      expect(
        urlObject.searchParams.get("filter_items_in_personal_collection"),
      ).toEqual(null);
    });
  });

  describe("library dashboards", () => {
    const libraryDashboard = createMockDashboard({
      collection: LIBRARY_DASHBOARDS_COLLECTION,
    });
    const libraryMetric = createMockCollectionItem({
      id: getNextId(),
      model: "metric",
      name: "Revenue",
    });

    const setupLibraryDashboard = (opts: Partial<SetupOpts> = {}) =>
      setup({
        collections: LIBRARY_COLLECTIONS,
        dashboard: libraryDashboard,
        itemsCollection: LIBRARY_METRICS_COLLECTION,
        collectionItems: [libraryMetric],
        hasLibraryFeature: true,
        ...opts,
      });

    afterEach(() => {
      reinitialize();
    });

    it("should browse from the Library's Metrics collection and not above it", async () => {
      setupCollectionItemsEndpoint({
        collection: LIBRARY_METRICS_SUBCOLLECTION,
        collectionItems: [],
      });
      await setupLibraryDashboard();
      assertBreadcrumbs([LIBRARY_METRICS_COLLECTION]);

      await userEvent.click(
        screen.getByRole("menuitem", {
          name: LIBRARY_METRICS_SUBCOLLECTION.name,
        }),
      );
      expect(
        await screen.findByText(LIBRARY_EMPTY_STATE_MESSAGE),
      ).toBeInTheDocument();
      assertBreadcrumbs([
        LIBRARY_METRICS_COLLECTION,
        LIBRARY_METRICS_SUBCOLLECTION,
      ]);
      expect(screen.queryByText(ROOT_COLLECTION.name)).not.toBeInTheDocument();
      expect(
        screen.queryByText(LIBRARY_COLLECTION.name),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByText(LIBRARY_METRICS_COLLECTION.name));
      expect(
        await screen.findByRole("menuitem", { name: libraryMetric.name }),
      ).toBeInTheDocument();
    });

    it("should search only within the Library's Metrics collection and explain the scope when nothing is found", async () => {
      await setupLibraryDashboard();
      fetchMock.get({
        url: "path:/api/search",
        query: { collection: String(LIBRARY_METRICS_COLLECTION.id) },
        response: { data: [] },
      });

      await userEvent.type(screen.getByPlaceholderText("Search…"), "orders");

      expect(
        await screen.findByText(LIBRARY_EMPTY_STATE_MESSAGE),
      ).toBeInTheDocument();
      expect(screen.queryByText("Nothing here")).not.toBeInTheDocument();
    });

    it("should offer nothing when the user cannot read the Metrics collection", async () => {
      await setupLibraryDashboard({
        collections: [
          ...COLLECTIONS,
          LIBRARY_COLLECTION,
          LIBRARY_DASHBOARDS_COLLECTION,
        ],
        itemsCollection: undefined,
        collectionItems: [createMockCollectionItem({ id: getNextId() })],
      });

      expect(screen.getByText(LIBRARY_EMPTY_STATE_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
      expect(
        fetchMock.callHistory.called(
          `path:/api/collection/${LIBRARY_DASHBOARDS_COLLECTION.id}/items`,
        ),
      ).toBe(false);
    });
  });

  describe("new buttons", () => {
    it("displays the 'New Question' button if the user has data access", async () => {
      await setup({
        collections: COLLECTIONS,
        canCreateQueries: true,
      });
      expect(await screen.findByText("New Question")).toBeInTheDocument();
      expect(screen.queryByText("New SQL query")).not.toBeInTheDocument();
    });

    it("displays the 'New Question' and 'New SQL query' button if the user has native write access", async () => {
      await setup({
        collections: COLLECTIONS,
        canCreateQueries: true,
        canCreateNativeQueries: true,
      });
      expect(await screen.findByTestId("new-button-bar")).toBeInTheDocument();
      expect(await screen.findByText("New Question")).toBeInTheDocument();
      expect(await screen.findByText("New SQL query")).toBeInTheDocument();
    });

    it("does not display any buttons if the user has no access to either", async () => {
      await setup({
        collections: COLLECTIONS,
        canCreateQueries: false,
        canCreateNativeQueries: false,
      });
      expect(await screen.findByPlaceholderText(/Search/)).toBeInTheDocument();
      expect(screen.queryByText("New Question")).not.toBeInTheDocument();
      expect(screen.queryByText("New SQL query")).not.toBeInTheDocument();
    });
  });
});

function assertBreadcrumbs(collections: Collection[]) {
  collections.forEach((collection) => {
    expect(screen.getByText(collection.name)).toBeInTheDocument();
  });
}
