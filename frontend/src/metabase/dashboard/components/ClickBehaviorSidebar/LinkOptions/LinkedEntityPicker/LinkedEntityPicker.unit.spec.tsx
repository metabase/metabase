import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import { checkNotNull } from "metabase/lib/types";
import type {
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
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";
import type { StoreDashboard } from "metabase-types/store";
import { createMockDashboardState } from "metabase-types/store/mocks";

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
  id: PUBLIC_COLLECTION.id as number,
  name: PUBLIC_COLLECTION.name,
  model: "collection",
  collection_id: PUBLIC_COLLECTION.id as number,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id,
  name: "Personal collection",
  can_write: true,
  is_personal: true,
  location: "/",
});

const COLLECTIONS = [ROOT_COLLECTION, PUBLIC_COLLECTION, PERSONAL_COLLECTION];

interface SetupOpts {
  clickBehavior: EntityCustomDestinationClickBehavior;
  dashboard: Dashboard;
  searchResults?: SearchResult[];
  collectionItems?: CollectionItem[];
}

function setup({
  clickBehavior,
  dashboard,
  searchResults = [],
  collectionItems = [],
}: SetupOpts) {
  mockScrollBy();
  mockGetBoundingClientRect();
  setupCollectionsEndpoints({ collections: COLLECTIONS });

  setupCollectionByIdEndpoint({ collections: COLLECTIONS }),
    setupSearchEndpoints(searchResults);
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems,
  });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: PUBLIC_COLLECTION,
    collectionItems: [],
  });
  setupRecentViewsEndpoints([]);

  fetchMock.get("path:/api/user/recipients", { data: [] });

  renderWithProviders(
    <LinkedEntityPicker
      clickBehavior={clickBehavior}
      dashcard={createMockDashboardCard()}
      updateSettings={jest.fn()}
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

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual({
            context: "entity-picker",
            models: "dashboard",
            q: typedText,
            filter_items_in_personal_collection: "exclude",
          });
        });
      });
    });

    describe("dashboard in a personal collection", () => {
      const dashboardInPersonalCollection = createMockDashboard({
        collection: PERSONAL_COLLECTION,
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

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual({
            context: "entity-picker",
            models: "dashboard",
            q: typedText,
          });
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

          expect(
            await screen.findByText(questionSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");

          expect(urlObject.searchParams.getAll("models")).toEqual([
            "card",
            "dataset",
          ]);
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual({
            context: "entity-picker",
            models: ["card", "dataset"],
            q: typedText,
            filter_items_in_personal_collection: "exclude",
          });
        });
      });
    });

    describe("dashboard in a personal collection", () => {
      const dashboardInPersonalCollection = createMockDashboard({
        collection: PERSONAL_COLLECTION,
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
        expect(screen.getByText(PERSONAL_COLLECTION.name)).toBeInTheDocument();
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

          expect(
            await screen.findByText(questionSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual({
            context: "entity-picker",
            models: ["card", "dataset"],
            q: typedText,
          });
        });
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
