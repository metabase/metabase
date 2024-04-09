import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import { checkNotNull } from "metabase/lib/types";
import type { Collection, CollectionItem, Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import { AddCardSidebar } from "./AddCardSidebar";

const CURRENT_USER = createMockUser({
  id: 1,
  personal_collection_id: 100,
  is_superuser: true,
});

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
  id: CURRENT_USER.personal_collection_id,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER.id,
  can_write: true,
  is_personal: true,
  location: "/",
});

const PERSONAL_SUBCOLLECTION = createMockCollection({
  id: (CURRENT_USER.personal_collection_id as number) + 1,
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

interface SetupOpts {
  collections: Collection[];
  collectionItems?: CollectionItem[];
  dashboard?: Dashboard;
}

async function setup({
  collections,
  collectionItems = [],
  dashboard = createMockDashboard({
    collection: ROOT_COLLECTION,
  }),
}: SetupOpts) {
  setupCollectionsEndpoints({
    collections,
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection(checkNotNull(dashboard.collection)),
    collectionItems,
  });

  renderWithProviders(<AddCardSidebar onSelect={jest.fn()} />, {
    storeInitialState: createMockState({
      currentUser: CURRENT_USER,
      dashboard: createMockDashboardState({
        dashboards: {
          [dashboard.id]: { ...dashboard, dashcards: [] },
        },
        dashboardId: dashboard.id,
      }),
    }),
  });

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

      collectionItems.forEach(collectionItem => {
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
        models: ["card", "dataset"],
        offset: 0,
        limit: 50,
      };
      const questionInPublicCollection = createMockSearchResult({
        name: "question in public collection",
        model: "card",
      });
      fetchMock.get(
        {
          url: "path:/api/search",
          query: {
            ...baseQuery,
            q: typedText,
            filter_items_in_personal_collection: "exclude",
          },
        },
        {
          data: [questionInPublicCollection],
        },
      );

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

      collectionItems.forEach(collectionItem => {
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
        models: ["card", "dataset"],
        offset: 0,
        limit: 50,
      };
      const questionInPublicCollection = createMockSearchResult({
        name: "question in public collection",
        model: "card",
      });
      fetchMock.get(
        {
          url: "path:/api/search",
          query: {
            ...baseQuery,
            q: typedText,
            filter_items_in_personal_collection: "exclude",
          },
        },
        {
          data: [questionInPublicCollection],
        },
      );

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

      collectionItems.forEach(collectionItem => {
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
        models: ["card", "dataset"],
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
      fetchMock.get(
        {
          url: "path:/api/search",
          query: {
            ...baseQuery,
            q: typedText,
          },
        },
        {
          data: [questionInPublicCollection, questionInPersonalCollection],
        },
      );

      expect(
        await screen.findByText(questionInPublicCollection.name),
      ).toBeInTheDocument();
      expect(
        screen.getByText(questionInPersonalCollection.name),
      ).toBeInTheDocument();

      // There's no way to math a URL that a query param is not present
      // with fetch-mock, so we have to assert it manually.
      const call = fetchMock.lastCall("path:/api/search");
      const urlObject = new URL(checkNotNull(call?.request?.url));
      expect(urlObject.pathname).toEqual("/api/search");
      expect(
        urlObject.searchParams.get("filter_items_in_personal_collection"),
      ).toEqual(null);
    });
  });
});

function assertBreadcrumbs(collections: Collection[]) {
  collections.forEach(collection => {
    expect(screen.getByText(collection.name)).toBeInTheDocument();
  });
}
