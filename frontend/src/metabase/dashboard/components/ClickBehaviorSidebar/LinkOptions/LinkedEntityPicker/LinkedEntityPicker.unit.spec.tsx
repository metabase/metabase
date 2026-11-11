import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockDashboardState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/common/collections/constants";
import type { StoreDashboard } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import type {
  ClickBehavior,
  CollectionItem,
  Dashboard,
  DashboardCustomDestinationClickBehavior,
  EntityCustomDestinationClickBehavior,
  QuestionCustomDestinationClickBehavior,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import { LinkedEntityPicker } from "./LinkedEntityPicker";

const CURRENT_USER = createMockUser({
  id: getNextId(),
  personal_collection_id: getNextId(),
  is_superuser: true,
});

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const PUBLIC_COLLECTION = createMockCollection({
  id: getNextId(),
  name: "Public collection",
  can_write: true,
  is_personal: false,
  location: "/",
});

const collectionInRootCollectionItem = createMockCollectionItem({
  // Unjustified type cast. FIXME
  id: PUBLIC_COLLECTION.id as number,
  name: PUBLIC_COLLECTION.name,
  model: "collection",
  here: ["card", "dashboard"],
  // Unjustified type cast. FIXME
  collection_id: PUBLIC_COLLECTION.id as number,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id ?? undefined,
  name: "Personal collection",
  can_write: true,
  is_personal: true,
  location: "/",
});

const COLLECTIONS = [ROOT_COLLECTION, PUBLIC_COLLECTION, PERSONAL_COLLECTION];

interface SetupOpts {
  clickBehavior: EntityCustomDestinationClickBehavior;
  dashboard: Dashboard;
  targetDashboard?: Dashboard;
  searchResults?: SearchResult[];
  collectionItems?: CollectionItem[];
}

function setup({
  clickBehavior,
  dashboard,
  targetDashboard,
  searchResults = [],
  collectionItems = [],
}: SetupOpts) {
  const updateSettings = jest.fn<void, [Partial<ClickBehavior>]>();
  mockGetBoundingClientRect();
  if (targetDashboard) {
    setupDashboardEndpoints(targetDashboard);
  }
  setupCollectionsEndpoints({ collections: COLLECTIONS });
  setupCollectionByIdEndpoint({ collections: COLLECTIONS });
  setupSearchEndpoints(searchResults);
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems,
  });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [
      createMockCollectionItem({
        id: 4545,
        name: "my card",
        model: "card",
        collection_id: PERSONAL_COLLECTION.id,
      }),
      createMockCollectionItem({
        id: 4546,
        name: "my dash",
        model: "dashboard",
        collection_id: PERSONAL_COLLECTION.id,
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: PUBLIC_COLLECTION,
    collectionItems: [],
  });
  setupRecentViewsAndSelectionsEndpoints([]);
  setupDatabasesEndpoints([]);

  fetchMock.get("path:/api/user/recipients", { data: [] });

  renderWithProviders(
    <LinkedEntityPicker
      clickBehavior={clickBehavior}
      dashcard={createMockDashboardCard()}
      updateSettings={updateSettings}
    />,
    {
      storeInitialState: {
        currentUser: CURRENT_USER,
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: {
            [dashboard.id]: createDashboardState(dashboard),
          },
        }),
      },
    },
  );

  return { updateSettings };
}

function createDashboardState(dashboard: Dashboard): StoreDashboard {
  return { ...dashboard, dashcards: [] };
}

describe("LinkedEntityPicker", () => {
  describe("link to a dashboard", () => {
    const clickBehavior: DashboardCustomDestinationClickBehavior = {
      type: "link",
      linkType: "dashboard",
    };

    const dashboardItem = {
      id: getNextId(),
      name: "dashboard in root collection",
      model: "dashboard" as const,
      collection: ROOT_COLLECTION,
    };
    const dashboardCollectionItem = createMockCollectionItem(dashboardItem);
    const dashboardSearchResult = createMockSearchResult(dashboardItem);

    describe("dashboard in a public collection", () => {
      const dashboardInPublicCollection = createMockDashboard({
        collection: PUBLIC_COLLECTION,
        // Unjustified type cast. FIXME
        collection_id: PUBLIC_COLLECTION.id as number,
      });

      it("should render only public collections", async () => {
        setup({
          clickBehavior,
          dashboard: dashboardInPublicCollection,
          collectionItems: [
            collectionInRootCollectionItem,
            dashboardCollectionItem,
          ],
        });

        expect(
          await screen.findByText("Pick a dashboard to link to"),
        ).toBeInTheDocument();
        expect(
          await screen.findByText(PUBLIC_COLLECTION.name),
        ).toBeInTheDocument();
        expect(
          screen.queryByText(/personal collection/i),
        ).not.toBeInTheDocument();
        expect(
          await screen.findByText(dashboardCollectionItem.name),
        ).toBeInTheDocument();
      });

      describe("search dashboards", () => {
        it("should search dashboards only in public collections", async () => {
          setup({
            clickBehavior,
            dashboard: dashboardInPublicCollection,
            searchResults: [dashboardSearchResult],
          });
          expect(screen.getByText(/Pick a dashboard/i)).toBeInTheDocument();
          const typedText = "dashboard";
          await userEvent.type(
            await screen.findByPlaceholderText(/search/i),
            typedText,
          );

          expect(
            await screen.findByText(dashboardSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.callHistory.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual(
            expect.objectContaining({
              context: "entity-picker",
              q: typedText,
              filter_items_in_personal_collection: "exclude",
            }),
          );
        });
      });
    });

    describe("dashboard in a personal collection", () => {
      const dashboardInPersonalCollection = createMockDashboard({
        collection: PERSONAL_COLLECTION,
        // Unjustified type cast. FIXME
        collection_id: PERSONAL_COLLECTION.id as number,
      });

      it("should render all collections", async () => {
        setup({
          clickBehavior,
          dashboard: dashboardInPersonalCollection,
          collectionItems: [
            collectionInRootCollectionItem,
            dashboardCollectionItem,
          ],
        });

        expect(
          await screen.findByText(/Pick a dashboard to link/),
        ).toBeInTheDocument();
        expect(
          await screen.findByText(PUBLIC_COLLECTION.name),
        ).toBeInTheDocument();
        expect(screen.getByText(PERSONAL_COLLECTION.name)).toBeInTheDocument();
        expect(
          await screen.findByText(dashboardCollectionItem.name),
        ).toBeInTheDocument();
      });

      describe("search dashboards", () => {
        it("should search all dashboards", async () => {
          setup({
            clickBehavior,
            dashboard: dashboardInPersonalCollection,
            searchResults: [dashboardSearchResult],
          });
          expect(
            await screen.findByText(/Pick a dashboard/),
          ).toBeInTheDocument();
          const typedText = "dashboard";
          await userEvent.type(
            await screen.findByPlaceholderText(/search/i),
            typedText,
          );

          expect(
            await screen.findByText(dashboardSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.callHistory.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");

          const params = Object.keys(
            urlSearchParamsToObject(urlObject.searchParams),
          );
          expect(params).toContain("q");
          expect(params).not.toContain("filter_items_in_personal_collection");
        });
      });
    });
  });

  describe("link to a saved question", () => {
    const clickBehavior: QuestionCustomDestinationClickBehavior = {
      type: "link",
      linkType: "question",
    };
    const questionItem = {
      id: getNextId(),
      name: "question in root collection",
      model: "card" as const,
      collection: ROOT_COLLECTION,
    };
    const questionCollectionItem = createMockCollectionItem(questionItem);
    const questionSearchResult = createMockSearchResult(questionItem);

    describe("dashboard in a public collection", () => {
      const dashboardInPublicCollection = createMockDashboard({
        collection: PUBLIC_COLLECTION,
        // Unjustified type cast. FIXME
        collection_id: PUBLIC_COLLECTION.id as number,
      });

      it("should render only public collections", async () => {
        setup({
          clickBehavior,
          dashboard: dashboardInPublicCollection,
          collectionItems: [
            collectionInRootCollectionItem,
            questionCollectionItem,
          ],
        });

        expect(
          await screen.findByText("Pick a question to link to"),
        ).toBeInTheDocument();
        expect(
          await screen.findByText(PUBLIC_COLLECTION.name),
        ).toBeInTheDocument();
        expect(
          screen.queryByText(PERSONAL_COLLECTION.name),
        ).not.toBeInTheDocument();
        expect(
          await screen.findByText(questionCollectionItem.name),
        ).toBeInTheDocument();
      });

      describe("questions", () => {
        it("should search questions only in public collections", async () => {
          setup({
            clickBehavior,
            dashboard: dashboardInPublicCollection,
            searchResults: [questionSearchResult],
          });
          expect(
            await screen.findByText(/Pick a question/),
          ).toBeInTheDocument();
          const typedText = "question";
          await userEvent.type(
            await screen.findByPlaceholderText(/search/i),
            typedText,
          );
          await userEvent.click(await screen.findByText("Everywhere"));

          expect(
            await screen.findByText(questionSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.callHistory.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");

          expect(urlObject.searchParams.getAll("models")).toEqual([
            "card",
            "dataset",
          ]);
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual(
            expect.objectContaining({
              context: "entity-picker",
              q: typedText,
              filter_items_in_personal_collection: "exclude",
            }),
          );
        });
      });
    });

    describe("dashboard in a personal collection", () => {
      const dashboardInPersonalCollection = createMockDashboard({
        collection: PERSONAL_COLLECTION,
        // Unjustified type cast. FIXME
        collection_id: PERSONAL_COLLECTION.id as number,
      });

      it("should render all collections", async () => {
        setup({
          clickBehavior,
          dashboard: dashboardInPersonalCollection,
          collectionItems: [
            collectionInRootCollectionItem,
            questionCollectionItem,
          ],
        });

        expect(
          await screen.findByText("Pick a question to link to"),
        ).toBeInTheDocument();
        expect(
          await screen.findByText(PUBLIC_COLLECTION.name),
        ).toBeInTheDocument();
        expect(
          screen.getByText(new RegExp(PERSONAL_COLLECTION.name)),
        ).toBeInTheDocument();
        expect(
          await screen.findByText(questionCollectionItem.name),
        ).toBeInTheDocument();
      });

      describe("search questions", () => {
        it("should search questions in all collections", async () => {
          setup({
            clickBehavior,
            dashboard: dashboardInPersonalCollection,
            searchResults: [questionSearchResult],
          });
          const typedText = "question";
          await userEvent.type(
            await screen.findByPlaceholderText(/search/i),
            typedText,
          );
          await userEvent.click(await screen.findByText("Everywhere"));

          expect(
            await screen.findByText(questionSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.callHistory.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          const params = Object.keys(
            urlSearchParamsToObject(urlObject.searchParams),
          );
          expect(params).toContain("q");
          expect(params).not.toContain("filter_items_in_personal_collection");
        });
      });
    });
  });

  describe("link to a dashboard tab", () => {
    const FIRST_TAB = createMockDashboardTab({ id: 900, name: "first" });
    const SECOND_TAB = createMockDashboardTab({ id: 901, name: "second" });
    const THIRD_TAB = createMockDashboardTab({ id: 902, name: "third" });
    const REMOVED_TAB_ID = 999;

    const sourceDashboard = createMockDashboard({
      id: getNextId(),
      collection: PUBLIC_COLLECTION,
    });

    const getClickBehavior = (
      targetDashboard: Dashboard,
      tabId: number | undefined,
    ): DashboardCustomDestinationClickBehavior => ({
      type: "link",
      linkType: "dashboard",
      targetId: targetDashboard.id,
      tabId,
      parameterMapping: {},
    });

    it("should select the first tab when no tab has been saved", async () => {
      const targetDashboard = createMockDashboard({
        id: getNextId(),
        tabs: [FIRST_TAB, SECOND_TAB, THIRD_TAB],
      });
      const clickBehavior = getClickBehavior(targetDashboard, undefined);
      const { updateSettings } = setup({
        clickBehavior,
        dashboard: sourceDashboard,
        targetDashboard,
      });

      expect(
        await screen.findByLabelText("Select a dashboard tab"),
      ).toHaveValue(FIRST_TAB.name);
      expect(updateSettings).toHaveBeenCalledWith({
        ...clickBehavior,
        tabId: FIRST_TAB.id,
      });
      expect(
        screen.queryByText("The selected tab is no longer available"),
      ).not.toBeInTheDocument();
    });

    it("should let the user pick another tab", async () => {
      const targetDashboard = createMockDashboard({
        id: getNextId(),
        tabs: [FIRST_TAB, SECOND_TAB, THIRD_TAB],
      });
      const clickBehavior = getClickBehavior(targetDashboard, FIRST_TAB.id);
      const { updateSettings } = setup({
        clickBehavior,
        dashboard: sourceDashboard,
        targetDashboard,
      });

      await userEvent.click(
        await screen.findByLabelText("Select a dashboard tab"),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: SECOND_TAB.name }),
      );

      expect(updateSettings).toHaveBeenCalledTimes(1);
      expect(updateSettings).toHaveBeenCalledWith({
        ...clickBehavior,
        tabId: SECOND_TAB.id,
      });
    });

    it("should show an error and let the user pick a new tab when the saved tab has been removed and several tabs are left", async () => {
      const targetDashboard = createMockDashboard({
        id: getNextId(),
        tabs: [FIRST_TAB, SECOND_TAB, THIRD_TAB],
      });
      const clickBehavior = getClickBehavior(targetDashboard, REMOVED_TAB_ID);
      const { updateSettings } = setup({
        clickBehavior,
        dashboard: sourceDashboard,
        targetDashboard,
      });

      expect(
        await screen.findByText("The selected tab is no longer available"),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Select a dashboard tab")).toHaveValue("");
      expect(updateSettings).not.toHaveBeenCalled();

      await userEvent.click(screen.getByLabelText("Select a dashboard tab"));
      await userEvent.click(
        await screen.findByRole("option", { name: SECOND_TAB.name }),
      );

      expect(updateSettings).toHaveBeenCalledTimes(1);
      expect(updateSettings).toHaveBeenCalledWith({
        ...clickBehavior,
        tabId: SECOND_TAB.id,
      });
    });

    it("should fall back to the first tab when the saved tab has been removed and only one tab is left", async () => {
      const targetDashboard = createMockDashboard({
        id: getNextId(),
        tabs: [],
      });
      const clickBehavior = getClickBehavior(targetDashboard, REMOVED_TAB_ID);
      const { updateSettings } = setup({
        clickBehavior,
        dashboard: sourceDashboard,
        targetDashboard,
      });

      expect(
        await screen.findByText(
          "Pass values to this dashboard's filters (optional)",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Select a dashboard tab"),
      ).not.toBeInTheDocument();
      expect(updateSettings).toHaveBeenCalledWith({
        ...clickBehavior,
        tabId: undefined,
      });
    });
  });
});

function urlSearchParamsToObject(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const object: Record<string, string | string[]> = {};
  for (const [key] of Array.from(searchParams)) {
    const value = searchParams.getAll(key);
    object[key] = value.length > 1 ? value : value[0];
  }
  return object;
}
