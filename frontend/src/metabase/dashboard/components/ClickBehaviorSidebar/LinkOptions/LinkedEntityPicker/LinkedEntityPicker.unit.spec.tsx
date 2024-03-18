import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
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
} from "metabase-types/api/mocks";
import type { StoreDashboard } from "metabase-types/store";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { LinkedEntityPicker } from "./LinkedEntityPicker";

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

const PERSONAL_COLLECTION = createMockCollection({
  id: getNextId(),
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
  setupCollectionsEndpoints({ collections: COLLECTIONS });
  setupSearchEndpoints(searchResults);
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems,
  });

  renderWithProviders(
    <LinkedEntityPicker
      clickBehavior={clickBehavior}
      dashcard={createMockDashboardCard()}
      updateSettings={jest.fn()}
    />,
    {
      storeInitialState: {
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
          collectionItems: [dashboardCollectionItem],
        });

        expect(
          screen.getByText("Pick a dashboard to link to"),
        ).toBeInTheDocument();
        expect(
          await screen.findByText(PUBLIC_COLLECTION.name),
        ).toBeInTheDocument();
        expect(
          screen.queryByText(PERSONAL_COLLECTION.name),
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
          await userEvent.click(screen.getByRole("button", { name: "Search" }));
          const typedText = "dashboard";
          await userEvent.type(
            screen.getByPlaceholderText("Search"),
            `${typedText}{enter}`,
          );

          expect(
            await screen.findByText(dashboardSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual({
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
          collectionItems: [dashboardCollectionItem],
        });

        expect(
          screen.getByText("Pick a dashboard to link to"),
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
        it("should search dashboards only in public collections", async () => {
          setup({
            clickBehavior,
            dashboard: dashboardInPersonalCollection,
            searchResults: [dashboardSearchResult],
          });
          await userEvent.click(screen.getByRole("button", { name: "Search" }));
          const typedText = "dashboard";
          await userEvent.type(
            screen.getByPlaceholderText("Search"),
            `${typedText}{enter}`,
          );

          expect(
            await screen.findByText(dashboardSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual({
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
          collectionItems: [questionCollectionItem],
        });

        expect(
          screen.getByText("Pick a question to link to"),
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
        it("should search questions in all collections", async () => {
          setup({
            clickBehavior,
            dashboard: dashboardInPublicCollection,
            searchResults: [questionSearchResult],
          });
          await userEvent.click(screen.getByRole("button", { name: "Search" }));
          const typedText = "question";
          await userEvent.type(
            screen.getByPlaceholderText("Search"),
            `${typedText}{enter}`,
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
          collectionItems: [questionCollectionItem],
        });

        expect(
          screen.getByText("Pick a question to link to"),
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
          await userEvent.click(screen.getByRole("button", { name: "Search" }));
          const typedText = "question";
          await userEvent.type(
            screen.getByPlaceholderText("Search"),
            `${typedText}{enter}`,
          );

          expect(
            await screen.findByText(questionSearchResult.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(urlSearchParamsToObject(urlObject.searchParams)).toEqual({
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
