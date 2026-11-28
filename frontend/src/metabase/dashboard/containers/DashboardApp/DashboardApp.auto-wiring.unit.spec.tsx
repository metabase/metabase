import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  setupNotificationChannelsEndpoints,
  setupSubscriptionsEndpoint,
} from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  mockGetBoundingClientRect,
  mockOffsetHeightAndWidth,
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION as ROOT } from "metabase/common/collections/constants";
import { UndoListing } from "metabase/common/components/UndoListing";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  CollectionItem,
  Dashboard,
  DashboardParameterMapping,
  DashboardTabId,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDataset,
  createMockParameter,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();

const DASHBOARD_ID = 1;

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});
const PERSONAL_COLLECTION = createMockCollection({
  id: 100,
  name: "My personal collection",
  personal_owner_id: 1,
  is_personal: true,
  location: "/",
});
const COLLECTIONS = [ROOT_COLLECTION, PERSONAL_COLLECTION];
const CURRENT_USER = createMockUser({
  id: 1,
  personal_collection_id: PERSONAL_COLLECTION.id,
});

const ORDERS_QUERY = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
);

const TEXT_FILTER = createMockParameter({
  id: "text",
  name: "Text",
  slug: "text",
  type: "string/=",
  sectionId: "string",
});

const NUMBER_FILTER = createMockParameter({
  id: "number",
  name: "Number",
  slug: "number",
  type: "number/=",
  sectionId: "number",
});

const TAB_1 = createMockDashboardTab({
  id: 1,
  dashboard_id: DASHBOARD_ID,
  name: "Tab 1",
});
const TAB_2 = createMockDashboardTab({
  id: 2,
  dashboard_id: DASHBOARD_ID,
  name: "Tab 2",
});

const ORDERS_CARD_1 = createMockCard({
  id: 1,
  name: "Orders 1",
  dataset_query: ORDERS_QUERY,
  collection_id: null,
});
const ORDERS_CARD_2 = createMockCard({
  id: 2,
  name: "Orders 2",
  dataset_query: ORDERS_QUERY,
  collection_id: null,
});
const ORDERS_CARD_3 = createMockCard({
  id: 3,
  name: "Orders 3",
  dataset_query: ORDERS_QUERY,
  collection_id: null,
});
const ORDERS_MODEL = createMockCard({
  id: 4,
  name: "Orders Model",
  type: "model",
  dataset_query: ORDERS_QUERY,
  collection_id: null,
});
const PRODUCTS_CARD = createMockCard({
  id: 5,
  name: "Products Table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
    }),
  ),
  collection_id: null,
});
const ORDERS_CARD_3_ITEM = createMockCollectionItem({
  id: ORDERS_CARD_3.id,
  model: "card",
  name: ORDERS_CARD_3.name,
});
const ORDERS_MODEL_ITEM = createMockCollectionItem({
  id: ORDERS_MODEL.id,
  model: "dataset",
  name: ORDERS_MODEL.name,
});
const ALL_CARDS = [
  ORDERS_CARD_1,
  ORDERS_CARD_2,
  ORDERS_CARD_3,
  ORDERS_MODEL,
  PRODUCTS_CARD,
];

function createDashcard({
  id,
  card,
  col = 0,
  sizeY = 5,
  tabId = null,
  parameterMappings = [],
}: {
  id: number;
  card: Card;
  col?: number;
  sizeY?: number;
  tabId?: DashboardTabId | null;
  parameterMappings?: DashboardParameterMapping[];
}) {
  return createMockDashboardCard({
    id,
    dashboard_id: DASHBOARD_ID,
    dashboard_tab_id: tabId,
    card_id: card.id,
    card,
    row: 0,
    col,
    size_x: 5,
    size_y: sizeY,
    parameter_mappings: parameterMappings,
  });
}

// The save response needs the saved dashcards with their cards. The tests
// assert the request body, so the response leaves out the mappings.
function setupDashboardSaveEndpoints(dashboard: Dashboard) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    if (!isObject(body) || !Array.isArray(body.dashcards)) {
      throw new Error("Expected a dashboard update with dashcards");
    }
    const dashcards = body.dashcards.map((dashcard: unknown, index: number) => {
      if (!isObject(dashcard)) {
        throw new Error("Expected a dashcard object");
      }
      const card = checkNotNull(
        ALL_CARDS.find(({ id }) => id === dashcard.card_id),
      );
      return createDashcard({ id: 100 + index, card, col: index * 5 });
    });
    return { ...dashboard, dashcards };
  });
}

type SetupOpts = {
  dashboard: Partial<Dashboard>;
  collectionItems?: CollectionItem[];
};

async function setup({
  dashboard: dashboardOpts,
  collectionItems = [ORDERS_CARD_3_ITEM, ORDERS_MODEL_ITEM],
}: SetupOpts) {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    collection: ROOT_COLLECTION,
    collection_id: null,
    ...dashboardOpts,
  });
  const database = createSampleDatabase();

  // the grid renders desktop layout only with a non-zero width
  mockOffsetHeightAndWidth(1200);
  mockGetBoundingClientRect({ width: 1200, height: 800 });
  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([database]);
  setupDashboardSaveEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  fetchMock.post(
    `express:/api/dashboard/${dashboard.id}/dashcard/:dashcardId/card/:cardId/query`,
    createMockDataset(),
  );
  setupCardsEndpoints(ALL_CARDS);
  ALL_CARDS.forEach((card) => {
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [database] }),
    );
    fetchMock.post(`path:/api/card/${card.id}/query`, createMockDataset());
  });
  setupCollectionsEndpoints({
    collections: COLLECTIONS,
    rootCollection: ROOT_COLLECTION,
  });
  setupCollectionByIdEndpoint({ collections: COLLECTIONS });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems,
  });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });
  setupRecentViewsAndSelectionsEndpoints([]);
  setupSubscriptionsEndpoint([]);
  setupSearchEndpoints([]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  renderWithProviders(
    <Route
      path="/dashboard/:slug"
      element={
        <>
          <DashboardApp />
          <UndoListing />
        </>
      }
    />,
    {
      initialRoute: `/dashboard/${dashboard.id}`,
      withRouter: true,
      storeInitialState: {
        currentUser: CURRENT_USER,
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForDashboardToLoad();
}

function getDashcard(cardName: string) {
  return checkNotNull(
    screen
      .getAllByTestId("dashcard")
      .find((dashcard) => within(dashcard).queryByText(cardName)),
  );
}

async function startEditing() {
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
}

async function goToFilterMapping(filterName: string) {
  await userEvent.click(
    within(
      screen.getByTestId("edit-dashboard-parameters-widget-container"),
    ).getByText(filterName),
  );
}

function getMappingButton(cardName: string) {
  return within(getDashcard(cardName)).getByRole("button", {
    name: /Select…|\./,
  });
}

async function selectColumn(cardName: string, columnName: string) {
  await userEvent.click(getMappingButton(cardName));
  const popover = await screen.findByRole("dialog");
  await userEvent.click(within(popover).getByText(columnName));
}

async function disconnect(cardName: string) {
  await userEvent.click(
    within(getDashcard(cardName)).getByRole("button", { name: "Disconnect" }),
  );
}

async function addCardFromSidebar(cardName: string) {
  if (!screen.queryByTestId("add-card-sidebar")) {
    await userEvent.click(screen.getByLabelText("Add questions"));
  }
  await userEvent.click(
    await within(screen.getByTestId("add-card-sidebar")).findByRole(
      "menuitem",
      { name: cardName },
    ),
  );
}

async function clickToastButton(message: string, buttonName: string) {
  await userEvent.click(
    within(await findToast(message)).getByRole("button", { name: buttonName }),
  );
}

function getToastMessages() {
  return screen
    .queryAllByTestId("toast-undo")
    .map((toast) => toast.textContent);
}

function findToast(message: string) {
  return waitFor(() =>
    checkNotNull(
      screen
        .queryAllByTestId("toast-undo")
        .find((toast) => toast.textContent?.includes(message)),
    ),
  );
}

async function waitForPendingRequests() {
  await act(async () => {
    await fetchMock.callHistory.flush(true);
  });
}

// a dismissed toast stays mounted until its exit transition ends
async function waitForNoToasts() {
  await waitFor(() => {
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();
  });
}

describe("DashboardApp > filter auto-wiring", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("parameter mapping", () => {
    it("should undo auto-wiring, not wire cards that already have a parameter, and wire cards with matching fields", async () => {
      await setup({
        dashboard: {
          parameters: [TEXT_FILTER],
          dashcards: [
            createDashcard({ id: 1, card: ORDERS_CARD_1, sizeY: 4 }),
            createDashcard({ id: 2, card: ORDERS_CARD_2, col: 5 }),
          ],
        },
      });

      await startEditing();
      await goToFilterMapping("Text");
      await selectColumn(ORDERS_CARD_1.name, "Name");

      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      await userEvent.click(
        within(
          await findToast(
            "Auto-connect this filter to all questions containing “User.Name”?",
          ),
        ).getByRole("button", { name: "Auto-connect" }),
      );
      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent(
        "User.Name",
      );

      // undo
      await userEvent.click(
        within(
          await findToast(
            "The filter was auto-connected to all questions containing “User.Name”.",
          ),
        ).getByRole("button", { name: "Undo" }),
      );
      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent("Select…");

      // the other card already has a mapping, so nothing to suggest
      await waitForNoToasts();
      await selectColumn(ORDERS_CARD_2.name, "Address");
      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent(
        "User.Address",
      );
      expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();

      // auto-wiring from a state without mappings
      await disconnect(ORDERS_CARD_2.name);
      await disconnect(ORDERS_CARD_1.name);
      await selectColumn(ORDERS_CARD_1.name, "Name");
      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent("Select…");
      const suggestionToast = await findToast(
        "Auto-connect this filter to all questions containing “User.Name”?",
      );
      expect(suggestionToast).not.toHaveTextContent("in the current tab");
      await userEvent.click(
        within(suggestionToast).getByRole("button", { name: "Auto-connect" }),
      );
      const undoToast = await findToast(
        "The filter was auto-connected to all questions containing “User.Name”.",
      );

      // the auto-connected hint is shown while the undo toast is open
      expect(
        await within(getDashcard(ORDERS_CARD_2.name)).findByText(
          "Auto-connected",
        ),
      ).toBeInTheDocument();
      expect(
        within(getDashcard(ORDERS_CARD_2.name)).getByLabelText("sparkles icon"),
      ).toBeInTheDocument();
      expect(
        within(getDashcard(ORDERS_CARD_1.name)).queryByText("Auto-connected"),
      ).not.toBeInTheDocument();

      await userEvent.click(within(undoToast).getByLabelText("close icon"));
      await waitFor(() => {
        expect(
          within(getDashcard(ORDERS_CARD_2.name)).queryByText("Auto-connected"),
        ).not.toBeInTheDocument();
      });
      expect(
        within(getDashcard(ORDERS_CARD_2.name)).queryByLabelText(
          "sparkles icon",
        ),
      ).not.toBeInTheDocument();
      expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent(
        "User.Name",
      );

      // replacing a card suggests wiring the new card
      await goToFilterMapping("Text");
      await userEvent.hover(getDashcard(ORDERS_CARD_2.name));
      await userEvent.click(
        within(getDashcard(ORDERS_CARD_2.name)).getByLabelText("Replace"),
      );
      await userEvent.click(
        await within(await screen.findByRole("dialog")).findByText(
          ORDERS_CARD_3.name,
        ),
      );
      await userEvent.click(
        within(await findToast("Auto-connect “Orders 3” to “Text”?")).getByRole(
          "button",
          { name: "Auto-connect" },
        ),
      );
      expect(
        await findToast("“Orders 3” was auto-connected to “Text”."),
      ).toBeInTheDocument();
      await goToFilterMapping("Text");
      expect(getMappingButton(ORDERS_CARD_3.name)).toHaveTextContent(
        "User.Name",
      );
    });

    it("should not suggest to wire parameters to cards that don't have a matching field", async () => {
      await setup({
        dashboard: {
          parameters: [TEXT_FILTER],
          dashcards: [
            createDashcard({ id: 1, card: ORDERS_CARD_1 }),
            createDashcard({ id: 2, card: PRODUCTS_CARD, col: 5 }),
          ],
        },
      });

      await startEditing();
      await goToFilterMapping("Text");
      await selectColumn(ORDERS_CARD_1.name, "Name");

      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(PRODUCTS_CARD.name)).toHaveTextContent("Select…");
      expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();
    });

    it("should dismiss suggestion toasts after 12s, restarting for a second suggestion, and the undo toast after 8s", async () => {
      await setup({
        dashboard: {
          parameters: [TEXT_FILTER],
          dashcards: [
            createDashcard({ id: 1, card: ORDERS_CARD_1 }),
            createDashcard({ id: 2, card: ORDERS_CARD_2, col: 5 }),
            createDashcard({ id: 3, card: ORDERS_CARD_3, col: 10 }),
          ],
        },
      });
      await startEditing();
      await goToFilterMapping("Text");

      jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });
      const tick = (ms: number) =>
        act(async () => {
          jest.advanceTimersByTime(ms);
        });
      const selectName = async () => {
        await user.click(getMappingButton(ORDERS_CARD_1.name));
        await user.click(
          within(await screen.findByRole("dialog")).getByText("Name"),
        );
        // keep the pointer off the toast, which pauses its timer
        await user.unhover(getDashcard(ORDERS_CARD_1.name));
      };
      const disconnectFirstCard = () =>
        user.click(
          within(getDashcard(ORDERS_CARD_1.name)).getByRole("button", {
            name: "Disconnect",
          }),
        );
      const suggestion =
        "Auto-connect this filter to all questions containing “User.Name”?";
      // a dismissed toast stays mounted until its exit transition ends, so
      // let 1s pass before checking either way
      const expectStillOpen = async (message: string) => {
        await tick(1000);
        expect(getToastMessages()).toEqual([expect.stringContaining(message)]);
      };
      const expectDismissed = async () => {
        await tick(1000);
        expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();
      };

      await selectName();
      expect(await findToast(suggestion)).toBeInTheDocument();
      await disconnectFirstCard();
      await tick(2000);
      await selectName();

      // 13s after the first suggestion, 11s after the second one
      await tick(10000);
      await expectStillOpen(suggestion);
      // 12s after the second suggestion
      await tick(1000);
      await expectDismissed();

      await disconnectFirstCard();
      await selectName();
      await tick(1000);
      await user.click(
        within(await findToast(suggestion)).getByRole("button", {
          name: "Auto-connect",
        }),
      );
      await tick(6000);
      await expectStillOpen(
        "The filter was auto-connected to all questions containing “User.Name”.",
      );
      // 8s after the undo toast opened
      await tick(1000);
      await expectDismissed();
    });

    describe("multiple tabs", () => {
      it("should not wire parameters to cards in different tabs", async () => {
        await setup({
          dashboard: {
            parameters: [TEXT_FILTER],
            tabs: [TAB_1, TAB_2],
            dashcards: [
              createDashcard({ id: 1, card: ORDERS_CARD_1, tabId: TAB_1.id }),
              createDashcard({
                id: 2,
                card: ORDERS_CARD_2,
                col: 5,
                tabId: TAB_1.id,
              }),
              createDashcard({ id: 3, card: ORDERS_MODEL, tabId: TAB_2.id }),
            ],
          },
        });

        await startEditing();
        await userEvent.click(screen.getByRole("tab", { name: TAB_2.name }));
        await goToFilterMapping("Text");
        await selectColumn(ORDERS_MODEL.name, "Name");

        expect(getMappingButton(ORDERS_MODEL.name)).toHaveTextContent(
          "User.Name",
        );
        expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: TAB_1.name }));
        expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
          "Select…",
        );
        expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent(
          "Select…",
        );

        await selectColumn(ORDERS_CARD_2.name, "Name");
        expect(
          await findToast(
            "Auto-connect this filter to all questions containing “User.Name”, in the current tab?",
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("add a card", () => {
    it("should wire parameters to cards that are added to the dashboard and undo it", async () => {
      await setup({
        dashboard: {
          parameters: [TEXT_FILTER],
          dashcards: [
            createDashcard({ id: 1, card: ORDERS_CARD_1 }),
            createDashcard({ id: 2, card: ORDERS_CARD_2, col: 5 }),
          ],
        },
      });

      await startEditing();
      await goToFilterMapping("Text");
      await selectColumn(ORDERS_CARD_1.name, "Name");
      await clickToastButton(
        "Auto-connect this filter to all questions containing “User.Name”?",
        "Auto-connect",
      );
      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent(
        "User.Name",
      );

      await addCardFromSidebar(ORDERS_MODEL.name);
      await goToFilterMapping("Text");
      await clickToastButton(
        "Auto-connect “Orders Model” to “Text”?",
        "Auto-connect",
      );
      expect(
        await findToast("“Orders Model” was auto-connected to “Text”."),
      ).toBeInTheDocument();
      [ORDERS_CARD_1, ORDERS_CARD_2, ORDERS_MODEL].forEach((card) => {
        expect(getMappingButton(card.name)).toHaveTextContent("User.Name");
      });

      await clickToastButton(
        "“Orders Model” was auto-connected to “Text”.",
        "Undo",
      );
      expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent(
        "User.Name",
      );
      expect(getMappingButton(ORDERS_MODEL.name)).toHaveTextContent("Select…");
    });

    describe("multiple tabs", () => {
      it("should not wire parameters to cards that are added to the dashboard in a different tab", async () => {
        await setup({
          dashboard: {
            parameters: [NUMBER_FILTER, TEXT_FILTER],
            dashcards: [
              createDashcard({ id: 1, card: ORDERS_CARD_1 }),
              createDashcard({ id: 2, card: ORDERS_CARD_2, col: 5 }),
            ],
          },
        });

        await startEditing();
        await goToFilterMapping("Text");
        await selectColumn(ORDERS_CARD_1.name, "Name");
        await clickToastButton(
          "Auto-connect this filter to all questions containing",
          "Auto-connect",
        );
        expect(getMappingButton(ORDERS_CARD_1.name)).toHaveTextContent(
          "User.Name",
        );
        expect(getMappingButton(ORDERS_CARD_2.name)).toHaveTextContent(
          "User.Name",
        );

        await userEvent.click(screen.getByLabelText("Create new tab"));
        await addCardFromSidebar(ORDERS_MODEL.name);
        expect(
          await within(getDashcard(ORDERS_MODEL.name)).findByText(
            ORDERS_MODEL.name,
          ),
        ).toBeInTheDocument();
        await goToFilterMapping("Text");
        expect(getMappingButton(ORDERS_MODEL.name)).toHaveTextContent(
          "Select…",
        );

        // the suggestion would come after the card metadata loads
        await waitForPendingRequests();
        expect(getToastMessages()).toEqual([
          expect.stringContaining(
            "The filter was auto-connected to all questions containing “User.Name”",
          ),
        ]);

        await selectColumn(ORDERS_MODEL.name, "Name");
        await goToFilterMapping("Number");
        await selectColumn(ORDERS_MODEL.name, "Total");

        await addCardFromSidebar(ORDERS_MODEL.name);
        await clickToastButton(
          "Auto-connect “Orders Model” to 2 filters with the same field?",
          "Auto-connect",
        );
        expect(
          await findToast("“Orders Model” was auto-connected to 2 filters."),
        ).toBeInTheDocument();
      });
    });
  });

  describe("dismiss toasts", () => {
    it("should dismiss auto-wire toasts on filter removal and on card removal", async () => {
      await setup({
        dashboard: {
          parameters: [TEXT_FILTER],
          dashcards: [
            createDashcard({ id: 1, card: ORDERS_CARD_1 }),
            createDashcard({ id: 2, card: ORDERS_CARD_2, col: 5 }),
          ],
        },
      });

      await startEditing();
      await goToFilterMapping("Text");
      await selectColumn(ORDERS_CARD_1.name, "Name");
      await clickToastButton(
        "Auto-connect this filter to all questions containing “User.Name”?",
        "Auto-connect",
      );
      await addCardFromSidebar(ORDERS_MODEL.name);
      expect(
        await findToast("Auto-connect “Orders Model” to “Text”?"),
      ).toBeInTheDocument();

      await goToFilterMapping("Text");
      await userEvent.click(
        within(
          await screen.findByTestId("dashboard-parameter-sidebar"),
        ).getByRole("button", { name: "Remove" }),
      );
      await waitForNoToasts();

      // card removal
      await userEvent.click(screen.getByLabelText("Add a filter or parameter"));
      await userEvent.click(await screen.findByText("Text or Category"));
      await selectColumn(ORDERS_CARD_1.name, "Name");
      await clickToastButton(
        "Auto-connect this filter to all questions containing “User.Name”?",
        "Auto-connect",
      );
      await addCardFromSidebar(ORDERS_CARD_3.name);
      expect(
        await findToast("Auto-connect “Orders 3” to “Text”?"),
      ).toBeInTheDocument();

      await userEvent.hover(getDashcard(ORDERS_CARD_3.name));
      await userEvent.click(
        within(
          within(getDashcard(ORDERS_CARD_3.name)).getByTestId(
            "dashboardcard-actions-panel",
          ),
        ).getByLabelText("close icon"),
      );
      await waitFor(() => {
        expect(getToastMessages()).toEqual([
          expect.stringContaining("Removed card"),
        ]);
      });
    });
  });

  it("should auto-wire a new card to correct parameter targets (metabase#44720)", async () => {
    const sourceFilter = createMockParameter({
      id: "27454068",
      name: "Source",
      slug: "source",
      type: "string/=",
      sectionId: "string",
    });
    const categoryFilter = createMockParameter({
      id: "27454069",
      name: "Category",
      slug: "category",
      type: "string/=",
      sectionId: "string",
    });
    const sourceTarget: DashboardParameterMapping["target"] = [
      "dimension",
      ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
    ];
    const categoryTarget: DashboardParameterMapping["target"] = [
      "dimension",
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ];
    await setup({
      dashboard: {
        parameters: [sourceFilter, categoryFilter],
        dashcards: [
          createDashcard({
            id: 1,
            card: ORDERS_CARD_1,
            parameterMappings: [
              {
                card_id: ORDERS_CARD_1.id,
                parameter_id: sourceFilter.id,
                target: sourceTarget,
              },
              {
                card_id: ORDERS_CARD_1.id,
                parameter_id: categoryFilter.id,
                target: categoryTarget,
              },
            ],
          }),
        ],
      },
    });

    await startEditing();
    await addCardFromSidebar(ORDERS_CARD_3.name);
    await clickToastButton(
      "Auto-connect “Orders 3” to 2 filters with the same field?",
      "Auto-connect",
    );

    await goToFilterMapping("Source");
    expect(getMappingButton(ORDERS_CARD_3.name)).toHaveTextContent(
      "User.Source",
    );
    await goToFilterMapping("Category");
    expect(getMappingButton(ORDERS_CARD_3.name)).toHaveTextContent(
      "Product.Category",
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const putCall = await waitFor(() =>
      checkNotNull(
        fetchMock.callHistory.lastCall(`path:/api/dashboard/${DASHBOARD_ID}`, {
          method: "PUT",
        }),
      ),
    );
    const body: unknown = JSON.parse(String(putCall.options.body));
    expect(body).toHaveProperty(
      "dashcards",
      expect.arrayContaining([
        expect.objectContaining({
          card_id: ORDERS_CARD_3.id,
          parameter_mappings: [
            expect.objectContaining({
              card_id: ORDERS_CARD_3.id,
              parameter_id: sourceFilter.id,
              target: expect.arrayContaining([
                "dimension",
                expect.arrayContaining([
                  "field",
                  PEOPLE.SOURCE,
                  expect.objectContaining({ "source-field": ORDERS.USER_ID }),
                ]),
              ]),
            }),
            expect.objectContaining({
              card_id: ORDERS_CARD_3.id,
              parameter_id: categoryFilter.id,
              target: expect.arrayContaining([
                "dimension",
                expect.arrayContaining([
                  "field",
                  PRODUCTS.CATEGORY,
                  expect.objectContaining({
                    "source-field": ORDERS.PRODUCT_ID,
                  }),
                ]),
              ]),
            }),
          ],
        }),
      ]),
    );
  });
});
