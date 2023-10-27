import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import type { Collection, CollectionItem, Dashboard } from "metabase-types/api";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
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
  id: CURRENT_USER.personal_collection_id + 1,
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

  it("should hide all personal collections when adding questions to dashboards in the root collection (public collection)", async () => {
    const dashboardInPublicCollection = createMockDashboard({
      collection: ROOT_COLLECTION,
    });
    await setup({
      collections: COLLECTIONS,
      dashboard: dashboardInPublicCollection,
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

  it("should show all questions when adding questions to dashboards in the root collection (public collection)", async () => {
    const dashboardInRootCollection = createMockDashboard({
      collection: ROOT_COLLECTION,
    });

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

  it("should show all questions when adding questions to dashboards in public collections", async () => {
    const dashboardInPublicSubcollection = createMockDashboard({
      collection: SUBCOLLECTION,
    });

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

  it("should show all collections when adding questions to dashboards in personal subcollections", async () => {
    const dashboardInPersonalSubcollection = createMockDashboard({
      collection: PERSONAL_SUBCOLLECTION,
    });
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

  it("should show all questions when adding questions to dashboards in personal subcollections", async () => {
    const dashboardInPersonalSubcollection = createMockDashboard({
      collection: PERSONAL_SUBCOLLECTION,
    });

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
});

function assertBreadcrumbs(collections: Collection[]) {
  collections.forEach(collection => {
    expect(screen.getByText(collection.name)).toBeInTheDocument();
  });
}
