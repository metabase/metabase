import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupMostRecentlyViewedDashboard,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import { checkNotNull, isNotNull } from "metabase/utils/types";
import type {
  BaseEntityId,
  Card,
  Collection,
  Dashboard,
  SearchResult,
  User,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  ADMIN_PERSONAL_COLLECTION,
  ADMIN_USER,
  FIRST_COLLECTION,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION,
  NORMAL_USER,
  ROOT as ROOT_WITH_WRITE_ACCESS,
  expectSearchResults,
  findSearchResult,
  getLastSearchParams,
  getRootItem,
  getScopeRadio,
  getSearchScopeSelector,
  typeSearchText,
} from "../tests/search";

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
  const dashboards = Array.from(
    new Set([...DASHBOARDS, mostRecentlyViewedDashboard].filter(isNotNull)),
  );

  setupCollectionsEndpoints({ collections, rootCollection: ROOT_COLLECTION });
  setupCollectionByIdEndpoint({ collections, error });
  setupRecentViewsAndSelectionsEndpoints([]);
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
              type: undefined,
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
  const onClose = jest.fn();

  renderWithProviders(
    <Route
      path="/"
      element={
        <AddToDashSelectDashModal
          card={card}
          onChangeLocation={onChangeLocation}
          onClose={onClose}
        />
      }
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: CURRENT_USER,
      },
    },
  );

  if (waitForContent) {
    await waitForLoaderToBeRemoved();
  }

  return { onChangeLocation, onClose };
};

describe("AddToDashSelectDashModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
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

    it("should close the create dashboard dialog, then the picker, with the Escape key", async () => {
      const { onClose } = await setup();

      await userEvent.click(
        await screen.findByRole("button", { name: /New dashboard/ }),
      );
      expect(
        await screen.findByRole("dialog", { name: "Create a new dashboard" }),
      ).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Create a new dashboard" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("entity-picker-modal")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      await userEvent.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
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

describe("AddToDashSelectDashModal search", () => {
  const NO_COLLECTION_PERSONAL_COLLECTION = createMockCollection({
    id: 8,
    name: "No Collection Tableton's Personal Collection",
    personal_owner_id: 3,
    is_personal: true,
    location: "/",
    can_write: true,
  });
  const QUESTION = createMockCard({
    id: 50,
    name: "Orders, Count",
    collection_id: null,
  });

  type DashboardFixture = { id: number; name: string; collection: Collection };

  const createDashboardFixtures = (
    namePrefix: string,
    collection: Collection,
    firstId: number,
  ): DashboardFixture[] =>
    ["1", "2"].map((suffix, index) => ({
      id: firstId + index,
      name: `${namePrefix} ${suffix}`,
      collection,
    }));

  const DASHBOARDS = [
    ...createDashboardFixtures("Root dashboard", ROOT_WITH_WRITE_ACCESS, 100),
    ...createDashboardFixtures("Regular dashboard", FIRST_COLLECTION, 200),
    ...createDashboardFixtures(
      "Normal personal dashboard",
      NORMAL_PERSONAL_COLLECTION,
      300,
    ),
  ];

  const ADMIN_DASHBOARDS = [
    ...createDashboardFixtures(
      "Admin personal dashboard",
      ADMIN_PERSONAL_COLLECTION,
      400,
    ),
    ...createDashboardFixtures(
      "Normal personal dashboard",
      NORMAL_PERSONAL_COLLECTION,
      300,
    ),
    ...createDashboardFixtures(
      "No collection personal dashboard",
      NO_COLLECTION_PERSONAL_COLLECTION,
      500,
    ),
  ];

  const toCollectionItem = ({ id, name }: DashboardFixture) =>
    createMockCollectionItem({ id, name, model: "dashboard", can_write: true });

  type SearchSetupOpts = {
    currentUser?: User;
    dashboards?: DashboardFixture[];
  };

  const setupSearch = async ({
    currentUser = NORMAL_USER,
    dashboards = DASHBOARDS,
  }: SearchSetupOpts = {}) => {
    process.env.OVERSCAN = "20";
    mockGetBoundingClientRect();
    const collections = [
      ROOT_WITH_WRITE_ACCESS,
      FIRST_COLLECTION,
      NORMAL_PERSONAL_COLLECTION,
      ADMIN_PERSONAL_COLLECTION,
      NO_COLLECTION_PERSONAL_COLLECTION,
    ];
    setupCollectionsEndpoints({
      collections,
      rootCollection: ROOT_WITH_WRITE_ACCESS,
    });
    setupCollectionByIdEndpoint({ collections });
    setupRecentViewsAndSelectionsEndpoints([]);
    setupMostRecentlyViewedDashboard(undefined);
    setupDatabasesEndpoints([]);
    collections.forEach((collection) =>
      setupCollectionItemsEndpoint({
        collection,
        collectionItems: [
          ...(collection.id === ROOT_WITH_WRITE_ACCESS.id
            ? [
                createMockCollectionItem({
                  id: FIRST_COLLECTION_ID,
                  name: FIRST_COLLECTION.name,
                  model: "collection",
                  can_write: true,
                  here: ["dashboard"],
                  below: ["dashboard"],
                }),
              ]
            : []),
          ...dashboards
            .filter((dashboard) => dashboard.collection.id === collection.id)
            .map(toCollectionItem),
        ],
      }),
    );
    setupSearchEndpoints(
      dashboards.map(({ id, name, collection }) =>
        createMockSearchResult({
          id,
          name,
          model: "dashboard",
          can_write: true,
          collection,
        }),
      ),
      undefined,
      { filterByScope: true },
    );
    fetchMock.get("path:/api/user/recipients", { data: [] });

    const onChangeLocation = jest.fn();
    renderWithProviders(
      <Route
        path="/"
        element={
          <AddToDashSelectDashModal
            card={QUESTION}
            onChangeLocation={onChangeLocation}
            onClose={() => undefined}
          />
        }
      />,
      { withRouter: true, storeInitialState: { currentUser } },
    );
    await waitForLoaderToBeRemoved();
    return { onChangeLocation };
  };

  const openFirstCollection = async () => {
    await userEvent.click(await screen.findByText("First collection"));
    await expectActiveItem("First collection");
  };

  it("should add the question to a dashboard picked from the search of the current collection", async () => {
    const { onChangeLocation } = await setupSearch();

    await openFirstCollection();
    await typeSearchText("dashboard");
    expect(getScopeRadio("First collection")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(FIRST_COLLECTION_ID),
    );
    await expectSearchResults(["Regular dashboard 1", "Regular dashboard 2"]);
    await userEvent.click(await findSearchResult("Regular dashboard 2"));
    await userEvent.click(screen.getByRole("button", { name: "Select" }));

    expect(onChangeLocation).toHaveBeenCalledTimes(1);
    expect(onChangeLocation).toHaveBeenCalledWith(
      `/dashboard/201-regular-dashboard-2#add=${QUESTION.id}&edit`,
    );
  });

  it("should add the question to a dashboard picked from the search everywhere", async () => {
    const { onChangeLocation } = await setupSearch();

    await openFirstCollection();
    await typeSearchText("dashboard");
    await userEvent.click(getScopeRadio("Everywhere"));
    expect(getScopeRadio("Everywhere")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBeNull();
    await userEvent.click(await findSearchResult("Root dashboard 2"));
    await userEvent.click(screen.getByRole("button", { name: "Select" }));

    expect(onChangeLocation).toHaveBeenCalledTimes(1);
    expect(onChangeLocation).toHaveBeenCalledWith(
      `/dashboard/101-root-dashboard-2#add=${QUESTION.id}&edit`,
    );
  });

  it("should search the current collection for a normal user", async () => {
    await setupSearch();

    await openFirstCollection();
    await typeSearchText("dashboard 1");
    expect(getScopeRadio("First collection")).toBeChecked();
    expect(getLastSearchParams().getAll("models")).toEqual([
      "dashboard",
      "collection",
    ]);
    await expectSearchResults(["Regular dashboard 1"]);

    await userEvent.click(getScopeRadio("Everywhere"));
    expect(getLastSearchParams().get("collection")).toBeNull();
    await expectSearchResults([
      "Root dashboard 1",
      "Regular dashboard 1",
      "Normal personal dashboard 1",
    ]);

    await userEvent.click(getScopeRadio("First collection"));
    expect(getScopeRadio("First collection")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(FIRST_COLLECTION_ID),
    );
    await expectSearchResults(["Regular dashboard 1"]);

    await userEvent.click(getRootItem(/Robert Tableton's Personal/));
    await typeSearchText("personal dashboard 1");
    expect(getScopeRadio(/Robert Tableton/)).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(NORMAL_PERSONAL_COLLECTION.id),
    );
    await expectSearchResults(["Normal personal dashboard 1"]);
  });

  it("should only search everywhere from all personal collections", async () => {
    await setupSearch({
      currentUser: ADMIN_USER,
      dashboards: ADMIN_DASHBOARDS,
    });

    await userEvent.click(await screen.findByText("All personal collections"));
    expect(
      await screen.findByText("Robert Tableton's Personal Collection"),
    ).toBeInTheDocument();
    await typeSearchText("personal dashboard");

    await expectSearchResults([
      "Admin personal dashboard 1",
      "Admin personal dashboard 2",
      "Normal personal dashboard 1",
      "Normal personal dashboard 2",
      "No collection personal dashboard 1",
      "No collection personal dashboard 2",
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
