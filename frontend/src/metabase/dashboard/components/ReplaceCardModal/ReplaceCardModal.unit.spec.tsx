import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupLibraryEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
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
  within,
} from "__support__/ui";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { reinitialize } from "metabase/plugins";
import { checkNotNull } from "metabase/utils/types";
import type {
  Card,
  Collection,
  CollectionId,
  Dashboard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockCollectionItemFromCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockPlaceholderDashboardCard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ReplaceCardModal, isDisabledItem } from "./ReplaceCardModal";

const CURRENT_USER_ID = 1;
const PERSONAL_COLLECTION_ID = 2;
const REGULAR_COLLECTION_ID = 3;
const LIBRARY_ID = 50;
const LIBRARY_METRICS_ID = 51;
const LIBRARY_DASHBOARDS_ID = 53;
const COLLECTION_QUESTION_NAME = "Collection question";

const PERSONAL_COLLECTION = createMockCollection({
  id: PERSONAL_COLLECTION_ID,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER_ID,
  is_personal: true,
  location: "/",
});

const REGULAR_COLLECTION = createMockCollection({
  id: REGULAR_COLLECTION_ID,
  name: "First collection",
  location: "/",
  here: ["card"],
  below: ["card"],
});

const LIBRARY_COLLECTION = createMockCollection({
  id: LIBRARY_ID,
  name: "Library",
  type: "library",
  is_library_root: true,
  can_write: false,
  location: "/",
  here: ["collection"],
  below: ["collection", "metric", "dashboard"],
});

const LIBRARY_METRICS_COLLECTION = createMockCollection({
  id: LIBRARY_METRICS_ID,
  name: "Metrics",
  type: "library-metrics",
  is_library_root: true,
  location: `/${LIBRARY_ID}/`,
  here: ["metric"],
  below: ["metric"],
});

const LIBRARY_DATA_COLLECTION = createMockCollection({
  id: 52,
  name: "Data",
  type: "library-data",
  is_library_root: true,
  location: `/${LIBRARY_ID}/`,
  here: ["table"],
  below: ["table"],
});

const LIBRARY_DASHBOARDS_COLLECTION = createMockCollection({
  id: LIBRARY_DASHBOARDS_ID,
  name: "Dashboards",
  type: "library-dashboards",
  is_library_root: true,
  location: `/${LIBRARY_ID}/`,
  here: ["dashboard"],
  below: ["dashboard", "card"],
});

const toCollectionItem = (
  collection: Collection,
  collectionId: CollectionId | null = null,
) => ({
  ...createMockCollectionItemFromCollection(collection),
  type: collection.type,
  collection_id: collectionId,
});

const LIBRARY_METRIC = createMockCard({
  id: 10,
  name: "Revenue",
  type: "metric",
  collection_id: LIBRARY_METRICS_ID,
});

const REGULAR_QUESTION = createMockCard({
  id: 11,
  name: "Orders, Count",
  collection_id: null,
});

interface SetupOpts {
  dashboard: Dashboard;
  /** The card being replaced; a placeholder dashcard is used without one. */
  card?: Card;
}

async function setup({ dashboard, card }: SetupOpts) {
  // jsdom has no layout, so the virtualized lists need an overscan to render every row
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ library: true }),
  });
  setupEnterpriseOnlyPlugin("library");
  setupLibraryEndpoints(true, toCollectionItem(LIBRARY_COLLECTION));

  const collections = [
    PERSONAL_COLLECTION,
    REGULAR_COLLECTION,
    LIBRARY_COLLECTION,
    LIBRARY_METRICS_COLLECTION,
    LIBRARY_DATA_COLLECTION,
    LIBRARY_DASHBOARDS_COLLECTION,
  ];
  setupRecentViewsAndSelectionsEndpoints([]);
  setupCollectionsEndpoints({ collections });
  setupCollectionByIdEndpoint({ collections });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      toCollectionItem(REGULAR_COLLECTION),
      createMockCollectionItem({
        id: REGULAR_QUESTION.id,
        name: REGULAR_QUESTION.name,
        model: "card",
      }),
    ],
  });
  // an empty personal collection is left out of the picker's root
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [
      createMockCollectionItem({ id: 12, name: "Personal question" }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: REGULAR_COLLECTION,
    collectionItems: [
      createMockCollectionItem({ id: 13, name: COLLECTION_QUESTION_NAME }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: LIBRARY_COLLECTION,
    collectionItems: [
      LIBRARY_DATA_COLLECTION,
      LIBRARY_METRICS_COLLECTION,
      LIBRARY_DASHBOARDS_COLLECTION,
    ].map((collection) => toCollectionItem(collection, LIBRARY_ID)),
  });
  setupCollectionItemsEndpoint({
    collection: LIBRARY_METRICS_COLLECTION,
    collectionItems: [
      createMockCollectionItem({
        id: LIBRARY_METRIC.id,
        name: LIBRARY_METRIC.name,
        model: "metric",
        collection_id: LIBRARY_METRICS_ID,
      }),
    ],
  });
  if (card) {
    setupCardEndpoints(card);
  }
  setupSearchEndpoints([]);

  renderWithProviders(
    <ReplaceCardModal
      dashboard={dashboard}
      dashcard={
        card
          ? createMockDashboardCard({
              dashboard_id: dashboard.id,
              card_id: card.id,
              card,
            })
          : createMockPlaceholderDashboardCard({ dashboard_id: dashboard.id })
      }
      onSelect={jest.fn()}
      onClose={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({
          id: CURRENT_USER_ID,
          personal_collection_id: PERSONAL_COLLECTION_ID,
        }),
      }),
    },
  );

  // the modal opens on a timeout, so the picker is not in the DOM right away
  await screen.findByTestId("item-picker-level-0");
  await waitForLoaderToBeRemoved();
}

function getPickerLevel(level: number) {
  return screen.findByTestId(`item-picker-level-${level}`);
}

async function searchAndGetCollectionParam() {
  await userEvent.type(await screen.findByPlaceholderText("Search…"), "orders");
  await waitFor(() => {
    expect(fetchMock.callHistory.called("path:/api/search")).toBe(true);
  });
  const call = fetchMock.callHistory.lastCall("path:/api/search");
  return new URL(checkNotNull(call?.request?.url)).searchParams.get(
    "collection",
  );
}

describe("ReplaceCardModal", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should confine a library dashboard's picker to the Library and open it at the Library's metrics", async () => {
    await setup({
      dashboard: createMockDashboard({
        id: 7,
        collection_id: LIBRARY_DASHBOARDS_ID,
        collection: LIBRARY_DASHBOARDS_COLLECTION,
      }),
      card: REGULAR_QUESTION,
    });

    const rootLevel = await getPickerLevel(0);
    expect(within(rootLevel).getByText("Library")).toBeInTheDocument();
    expect(
      within(rootLevel).queryByText("Our analytics"),
    ).not.toBeInTheDocument();
    expect(
      within(rootLevel).queryByText("Recent items"),
    ).not.toBeInTheDocument();
    expect(
      within(rootLevel).queryByText(PERSONAL_COLLECTION.name),
    ).not.toBeInTheDocument();

    const libraryLevel = await getPickerLevel(1);
    expect(within(libraryLevel).getByText("Metrics")).toBeInTheDocument();
    expect(within(libraryLevel).queryByText("Data")).not.toBeInTheDocument();

    expect(
      await within(await getPickerLevel(2)).findByText(LIBRARY_METRIC.name),
    ).toBeInTheDocument();
    expect(screen.queryByText(REGULAR_QUESTION.name)).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called(`path:/api/card/${REGULAR_QUESTION.id}`),
    ).toBe(false);

    expect(await searchAndGetCollectionParam()).toBe(String(LIBRARY_ID));
  });

  it("should open a regular dashboard's placeholder at its collection, with every collection and recents", async () => {
    await setup({
      dashboard: createMockDashboard({
        id: 9,
        collection_id: REGULAR_COLLECTION_ID,
        collection: REGULAR_COLLECTION,
      }),
    });

    const rootLevel = await getPickerLevel(0);
    expect(within(rootLevel).getByText("Our analytics")).toBeInTheDocument();
    expect(within(rootLevel).getByText("Recent items")).toBeInTheDocument();
    expect(
      await within(await getPickerLevel(2)).findByText(
        COLLECTION_QUESTION_NAME,
      ),
    ).toBeInTheDocument();
  });
});

describe("isDisabledItem", () => {
  const DASHBOARD_ID = 7;

  it.each<{ item: OmniPickerItem; isDisabled: boolean }>([
    {
      item: { id: 1, name: "Q", model: "card", dashboard_id: 8 },
      isDisabled: true,
    },
    {
      item: { id: 1, name: "Q", model: "card", dashboard_id: DASHBOARD_ID },
      isDisabled: false,
    },
    { item: { id: 8, name: "D", model: "dashboard" }, isDisabled: true },
  ])(
    "should disable $item.model $item.id (dashboard $item.dashboard_id): $isDisabled",
    ({ item, isDisabled }) => {
      expect(isDisabledItem(item, DASHBOARD_ID)).toBe(isDisabled);
    },
  );
});
