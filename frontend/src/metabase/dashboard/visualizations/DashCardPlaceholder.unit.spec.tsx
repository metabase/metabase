import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockDashboardState, createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import {
  ADMIN_PERSONAL_COLLECTION,
  ADMIN_USER,
  FIRST_COLLECTION,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION,
  NORMAL_USER,
  ROOT,
  createCardSearchResults,
  expectSearchResults,
  findSearchResult,
  getCollectionItems,
  getLastSearchParams,
  getRootItem,
  getScopeRadio,
  getSearchScopeSelector,
  typeSearchText,
} from "metabase/common/components/Pickers/tests/search";
import { createMockVisualizationProps } from "metabase/visualizations/types/mocks";
import type { Collection, SearchResult, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollectionItem,
  createMockDashboard,
  createMockDataset,
  createMockPlaceholderDashboardCard,
} from "metabase-types/api/mocks";

import { DashCardPlaceholder } from "./DashCardPlaceholder";

const PICKER_TITLE = "Pick what you want to replace this with";

const SEARCH_RESULTS = createCardSearchResults([
  { collection: ROOT, namePrefix: "Root" },
  { collection: FIRST_COLLECTION, namePrefix: "Regular" },
  {
    collection: NORMAL_PERSONAL_COLLECTION,
    namePrefix: "Normal personal collection",
  },
]);

const ADMIN_SEARCH_RESULTS = createCardSearchResults([
  { collection: ROOT, namePrefix: "Root" },
  {
    collection: ADMIN_PERSONAL_COLLECTION,
    namePrefix: "Admin personal collection",
  },
]);

const getSearchResultByName = (name: string, searchResults: SearchResult[]) => {
  const result = searchResults.find((item) => item.name === name);
  if (!result) {
    throw new Error(`No search result named ${name}`);
  }
  return result;
};

type SetupOpts = {
  currentUser?: User;
  searchResults?: SearchResult[];
  collections?: Collection[];
};

const setup = async ({
  currentUser = NORMAL_USER,
  searchResults = SEARCH_RESULTS,
  collections = [ROOT, FIRST_COLLECTION, NORMAL_PERSONAL_COLLECTION],
}: SetupOpts = {}) => {
  mockGetBoundingClientRect();
  process.env.OVERSCAN = "20";

  const dashboard = createMockDashboard({ id: 10, collection_id: null });
  const dashcard = createMockPlaceholderDashboardCard({
    id: -1,
    dashboard_id: dashboard.id,
  });

  setupDatabasesEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupCollectionByIdEndpoint({ collections });
  setupCollectionsEndpoints({ collections, rootCollection: ROOT });
  collections.forEach((collection) =>
    setupCollectionItemsEndpoint({
      collection,
      collectionItems: [
        ...(collection.id === ROOT.id
          ? [
              createMockCollectionItem({
                id: FIRST_COLLECTION_ID,
                name: FIRST_COLLECTION.name,
                model: "collection",
                here: ["card", "dataset", "metric"],
                below: ["card", "dataset", "metric"],
              }),
            ]
          : []),
        ...getCollectionItems(searchResults, collection),
      ],
    }),
  );
  setupSearchEndpoints(searchResults, undefined, { filterByScope: true });
  searchResults.forEach(({ id, name }) => {
    const card = createMockCard({ id, name });
    setupCardEndpoints(card);
    setupCardQueryMetadataEndpoint(card, createMockCardQueryMetadata());
    setupCardQueryEndpoints(card, createMockDataset());
  });

  renderWithProviders(
    <DashCardPlaceholder
      {...createMockVisualizationProps({ isDashboard: true, isEditing: true })}
      dashboard={dashboard}
      dashcard={dashcard}
    />,
    {
      storeInitialState: createMockState({
        currentUser,
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: { [dashboard.id]: { ...dashboard, dashcards: [-1] } },
          dashcards: { [dashcard.id]: dashcard },
        }),
      }),
    },
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Select question" }),
  );
  expect(
    await screen.findByRole("dialog", { name: PICKER_TITLE }),
  ).toBeInTheDocument();
};

const expectPickedCard = async (cardId: number) => {
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: PICKER_TITLE }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(fetchMock.callHistory.called(`path:/api/card/${cardId}`)).toBe(true),
  );
  const requestedCardIds = fetchMock.callHistory
    .calls()
    .map((call) => new URL(call.url).pathname.match(/^\/api\/card\/(\d+)$/))
    .flatMap((match) => (match ? [Number(match[1])] : []));
  expect(requestedCardIds).toEqual([cardId]);
};

describe("DashCardPlaceholder question picker", () => {
  it.each(["Root question 1", "Root model 2", "Root metric 1"])(
    "should replace the placeholder with %s picked from the search of Our analytics",
    async (name) => {
      await setup();

      await typeSearchText("Root");
      expect(getScopeRadio("Everywhere")).toBeChecked();
      await userEvent.click(await findSearchResult(name));

      await expectPickedCard(getSearchResultByName(name, SEARCH_RESULTS).id);
    },
  );

  it.each(["Regular question 1", "Regular model 2", "Regular metric 1"])(
    "should replace the placeholder with %s picked from the search everywhere",
    async (name) => {
      await setup();

      await userEvent.click(await screen.findByText("First collection"));
      await typeSearchText("Regular");
      expect(getScopeRadio("First collection")).toBeChecked();
      await userEvent.click(getScopeRadio("Everywhere"));
      expect(getScopeRadio("Everywhere")).toBeChecked();
      expect(getLastSearchParams().get("collection")).toBeNull();
      await userEvent.click(await findSearchResult(name));

      await expectPickedCard(getSearchResultByName(name, SEARCH_RESULTS).id);
    },
  );

  it("should search the current collection for a normal user", async () => {
    await setup();

    await typeSearchText("2");
    expect(getScopeRadio("Everywhere")).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBeNull();
    expect(getLastSearchParams().getAll("models")).toEqual([
      "card",
      "dataset",
      "metric",
      "dashboard",
    ]);
    await expectSearchResults([
      "Root question 2",
      "Root model 2",
      "Root metric 2",
      "Regular question 2",
      "Regular model 2",
      "Regular metric 2",
      "Normal personal collection question 2",
      "Normal personal collection model 2",
      "Normal personal collection metric 2",
    ]);

    await userEvent.click(getRootItem(/Our analytics/));
    await userEvent.click(await screen.findByText("First collection"));
    await typeSearchText("1");
    expect(getScopeRadio("First collection")).toBeChecked();
    expect(getScopeRadio("Everywhere")).not.toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(FIRST_COLLECTION_ID),
    );
    await expectSearchResults([
      "Regular question 1",
      "Regular model 1",
      "Regular metric 1",
    ]);

    await userEvent.click(getRootItem(/Robert Tableton's Personal/));
    await typeSearchText("2");
    expect(getScopeRadio(/Robert Tableton/)).toBeChecked();
    expect(getLastSearchParams().get("collection")).toBe(
      String(NORMAL_PERSONAL_COLLECTION.id),
    );
    await expectSearchResults([
      "Normal personal collection question 2",
      "Normal personal collection model 2",
      "Normal personal collection metric 2",
    ]);
  });

  it("should only search everywhere from all personal collections", async () => {
    await setup({
      currentUser: ADMIN_USER,
      searchResults: ADMIN_SEARCH_RESULTS,
      collections: [
        ROOT,
        ADMIN_PERSONAL_COLLECTION,
        NORMAL_PERSONAL_COLLECTION,
      ],
    });

    await userEvent.click(await screen.findByText("All personal collections"));
    expect(
      await screen.findByText("Robert Tableton's Personal Collection"),
    ).toBeInTheDocument();
    await typeSearchText("root");

    await expectSearchResults([
      "Root question 1",
      "Root question 2",
      "Root model 1",
      "Root model 2",
      "Root metric 1",
      "Root metric 2",
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
