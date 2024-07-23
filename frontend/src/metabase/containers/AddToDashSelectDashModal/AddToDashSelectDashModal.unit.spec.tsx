import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupMostRecentlyViewedDashboard,
  setupSearchEndpoints,
  setupCollectionItemsEndpoint,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  mockGetBoundingClientRect,
  mockScrollBy,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import { checkNotNull, isNotNull } from "metabase/lib/types";
import type {
  Card,
  Collection,
  Dashboard,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSearchResult,
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
  collection_id: null,
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
  id: CURRENT_USER.personal_collection_id,
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
  collection_id: SUBCOLLECTION.id as number,
  collection: SUBCOLLECTION,
});

const CARD_IN_PERSONAL_COLLECTION = createMockCard({
  id: getNextId(),
  name: "Card in a personal collection",
  type: "model",
  collection: PERSONAL_COLLECTION,
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
  collection_id: SUBCOLLECTION.id as number,
  model: "dashboard",
});

const dashboardInPersonalSubcollection = createMockDashboard({
  id: getNextId(),
  name: "Dashboard in personal subcollection",
  collection: PERSONAL_SUBCOLLECTION,
  collection_id: PERSONAL_SUBCOLLECTION.id as number,
  model: "dashboard",
});

const dashboardInPersonalCollection = createMockDashboard({
  id: getNextId(),
  name: "Dashboard in personal collection",
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
  dashboard?: Dashboard;
  mostRecentlyViewedDashboard?: Dashboard;
  waitForContent?: boolean;
  searchResults?: SearchResult[];
}

const setup = async ({
  card = CARD_IN_ROOT_COLLECTION,
  collections = COLLECTIONS,
  mostRecentlyViewedDashboard = undefined,
  error,
  waitForContent = true,
  searchResults = [],
}: SetupOpts = {}) => {
  mockGetBoundingClientRect();
  mockScrollBy();
  const dashboards = Array.from(
    new Set([...DASHBOARDS, mostRecentlyViewedDashboard].filter(isNotNull)),
  );

  setupCollectionsEndpoints({ collections, rootCollection: ROOT_COLLECTION });
  setupCollectionByIdEndpoint({ collections, error });
  setupRecentViewsEndpoints([]);
  setupMostRecentlyViewedDashboard(mostRecentlyViewedDashboard);
  setupSearchEndpoints(searchResults);

  collections.forEach(collection => {
    setupCollectionItemsEndpoint({
      collection,
      collectionItems: [
        ...collections
          .filter(c => getCollectionParentId(c) === collection.id)
          .map(c =>
            createMockCollectionItem({
              ...c,
              id: c.id as number,
              effective_location: c.location || "/",
              location: c.location || "/",
              type: undefined,
              model: "collection",
              here: ["collection", "dashboard"],
              below: ["collection", "dashboard"],
            }),
          ),
        ...dashboards
          .filter(
            d =>
              (collection.id === "root" && !d.collection_id) ||
              d.collection_id === collection.id,
          )
          .map(d =>
            createMockCollectionItem({
              ...d,
              id: d.id as number,
              model: "dashboard",
            }),
          ),
      ],
    });
  });

  dashboards.forEach(dashboard => {
    fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  });

  fetchMock.get(`path:/api/user/recipients`, { data: [] });

  const onChangeLocation = jest.fn();

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <AddToDashSelectDashModal
          card={card}
          onChangeLocation={onChangeLocation}
          onClose={() => undefined}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: CURRENT_USER,
      },
    },
  );

  if (waitForContent) {
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  }

  return { onChangeLocation };
};

describe("AddToDashSelectDashModal", () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should show loading", async () => {
    await setup({
      waitForContent: false,
      mostRecentlyViewedDashboard: DASHBOARD,
    });

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show error", async () => {
    const ERROR = "Server Error!";
    await setup({ error: ERROR, mostRecentlyViewedDashboard: DASHBOARD });

    expect(await screen.findByText(ERROR)).toBeInTheDocument();
  });

  it("should render dashboards when opening the root collection (public collection)", async () => {
    await setup();

    expect(
      await screen.findByRole("button", {
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
          collection => collection.id === DASHBOARD.collection_id,
        ),
      );

      console.log("dashboardCollection", dashboardCollection);

      await screen.findByText(/add this model to a dashboard/i);

      await assertPath([dashboardCollection]);
      expect(await findPickerItem(DASHBOARD.name)).toHaveAttribute(
        "data-active",
        "true",
      );
    });

    it("should pre-select dashboard in the root collection", async () => {
      await setup({
        dashboard: DASHBOARD_AT_ROOT,
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

      expect(await findPickerItem(ROOT_COLLECTION.name)).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(await findPickerItem(COLLECTION.name)).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(await findPickerItem(SUBCOLLECTION.name)).toHaveAttribute(
        "data-active",
        "true",
      );
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

      await screen.findAllByTestId("result-item");

      const call = fetchMock.lastCall("path:/api/search");
      const urlObject = new URL(checkNotNull(call?.request?.url));
      expect(urlObject.pathname).toEqual("/api/search");
      expect(Object.fromEntries(urlObject.searchParams.entries())).toEqual({
        context: "entity-picker",
        models: "dashboard",
        q: typedText,
        filter_items_in_personal_collection: "only",
      });
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

      await screen.findAllByTestId("result-item");

      const call = fetchMock.lastCall("path:/api/search");
      const urlObject = new URL(checkNotNull(call?.request?.url));
      expect(urlObject.pathname).toEqual("/api/search");
      expect(Object.fromEntries(urlObject.searchParams.entries())).toEqual({
        context: "entity-picker",
        models: "dashboard",
        q: typedText,
      });
    });
  });

  describe('"Create a new dashboard" option', () => {
    it('should render "Create a new dashboard" option', async () => {
      await setup();
      expect(
        await screen.findByRole("button", {
          name: /Create a new dashboard/,
        }),
      ).toBeInTheDocument();
    });

    it("should show the create dashboard dialog", async () => {
      // Second part of test requires a value to be "selected"
      const { onChangeLocation } = await setup({
        dashboard: DASHBOARD_AT_ROOT,
        mostRecentlyViewedDashboard: DASHBOARD_AT_ROOT,
      });

      await userEvent.click(
        await screen.findByRole("button", {
          name: /Create a new dashboard/,
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

function assertPath(collections: Collection[]) {
  return Promise.all(
    collections.map(async collection => {
      return expect(await findPickerItem(collection.name)).toBeInTheDocument();
    }),
  );
}

const clickPickerItem = async (item: string) => {
  return userEvent.click(await findPickerItem(item));
};

const findPickerItem = async (item: string) => {
  return screen.findByRole("button", { name: new RegExp(item) });
};
