import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { Card, CardId, Dashboard, DashboardId } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { MoveCardModal } from "./MoveCardModal";

const DESTINATION_COLLECTION_ID = 10;
const DESTINATION_COLLECTION = createMockCollection({
  id: DESTINATION_COLLECTION_ID,
  name: "Destination collection",
  can_write: true,
  location: "/",
});

function createRootDashboard(id: number, name: string) {
  return {
    dashboard: createMockDashboard({ id, name, collection_id: null }),
    item: createMockCollectionItem({
      id,
      model: "dashboard",
      name,
      collection_id: null,
      can_write: true,
    }),
  };
}

const BLUE = createRootDashboard(1, "Blue Dashboard");
const PURPLE = createRootDashboard(2, "Purple Dashboard");
const ORANGE = createRootDashboard(3, "Orange Dashboard");
const ROOT_DASHBOARDS = [BLUE, PURPLE, ORANGE];
const BLUE_DASHBOARD = BLUE.dashboard;
const PURPLE_DASHBOARD = PURPLE.dashboard;
const ORANGE_DASHBOARD = ORANGE.dashboard;

const CARD_ID = 42;

type CardDashboardsResponse = {
  card_id: CardId;
  dashboards: (
    | { id: DashboardId; name: string; error?: string }
    | { error: "unreadable-dashboard" }
  )[];
}[];

function setupPickerEndpoints({
  dashboardResponseDelay = 0,
}: Pick<SetupOpts, "dashboardResponseDelay">) {
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();

  const rootCollection = createMockCollection(ROOT_COLLECTION);
  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [DESTINATION_COLLECTION],
    rootCollection,
  });
  setupCollectionByIdEndpoint({ collections: [DESTINATION_COLLECTION] });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      createMockCollectionItem({
        id: DESTINATION_COLLECTION_ID,
        model: "collection",
        name: DESTINATION_COLLECTION.name,
        collection_id: null,
        can_write: true,
      }),
      ...ROOT_DASHBOARDS.map(({ item }) => item),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: DESTINATION_COLLECTION,
    collectionItems: [],
  });
  ROOT_DASHBOARDS.forEach(({ dashboard }) => {
    setupDashboardEndpoints(dashboard, { delay: dashboardResponseDelay });
    setupDashboardItemsEndpoint({ dashboard, dashboardItems: [] });
  });
  fetchMock.get("path:/api/search", { data: [] });
  fetchMock.get("path:/api/user/recipients", { data: [] });
}

type SetupOpts = {
  card: Card;
  dashboardResponseDelay?: number;
  cardDashboards?: CardDashboardsResponse;
  updateCardError?: { status: number; body: { message: string } };
};

const setup = ({
  card,
  cardDashboards = [],
  updateCardError,
  dashboardResponseDelay,
}: SetupOpts) => {
  setupPickerEndpoints({ dashboardResponseDelay });
  if (updateCardError) {
    // registered first, so it answers the first PUT only and later PUTs fall
    // through to the regular card endpoint
    fetchMock.put(`path:/api/card/${card.id}`, updateCardError, {
      repeat: 1,
      name: "card-put-error",
    });
  }
  setupCardEndpoints(card);
  fetchMock.post("path:/api/cards/dashboards", cardDashboards, {
    body: { card_ids: [card.id] },
  });

  const onClose = jest.fn<void, []>();

  renderWithProviders(<MoveCardModal card={card} onClose={onClose} />, {
    withUndos: true,
  });

  return { onClose };
};

async function chooseDestination(name: string) {
  await waitForLoaderToBeRemoved();
  await userEvent.click(await screen.findByText("Our analytics"));
  await userEvent.click(await screen.findByText(name));
  const pickerDialog = screen.getByRole("dialog");
  const moveButton = within(pickerDialog).getByRole("button", {
    name: "Move",
  });
  await waitFor(() => expect(moveButton).toBeEnabled());
  await userEvent.click(moveButton);
}

function getCardPutCalls() {
  return fetchMock.callHistory
    .calls(`path:/api/card/${CARD_ID}`)
    .filter((call) => call.options.method?.toUpperCase() === "PUT");
}

function getCardPutRequests(): {
  body: unknown;
  deleteOldDashcards: string | null;
}[] {
  return getCardPutCalls().map((call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    return {
      body,
      deleteOldDashcards: new URL(call.url).searchParams.get(
        "delete_old_dashcards",
      ),
    };
  });
}

// MoveCardModal passes unkeyed fragments to `jt` in its confirmation titles,
// which makes React warn about missing keys. Drop only that warning so the
// harness still fails the test on any other one.
function ignoreMissingKeyWarningFromMoveCardModal() {
  const harnessConsoleError = console.error;
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const [template, ...rest] = args;
    const isMissingKeyWarningFromMoveCardModal =
      typeof template === "string" &&
      template.includes(
        'Each child in a list should have a unique "key" prop',
      ) &&
      rest.some(
        (arg) => typeof arg === "string" && arg.includes("MoveCardModal"),
      );

    if (!isMissingKeyWarningFromMoveCardModal) {
      harnessConsoleError(...args);
    }
  });
}

const createDashboardQuestion = (dashboard: Dashboard) =>
  createMockCard({
    id: CARD_ID,
    name: "Blue Question",
    type: "question",
    collection_id: null,
    dashboard_id: dashboard.id,
    dashboard: { id: dashboard.id, name: dashboard.name },
    dashboard_count: 1,
  });

describe("MoveCardModal", () => {
  beforeEach(() => {
    ignoreMissingKeyWarningFromMoveCardModal();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("moving a dashboard question to a collection", () => {
    it("asks whether the question should still appear in its dashboard, keeping it there by default", async () => {
      const { onClose } = setup({
        card: createDashboardQuestion(BLUE_DASHBOARD),
      });

      await chooseDestination(DESTINATION_COLLECTION.name);

      const confirmModal = await screen.findByTestId(
        "dashboard-to-collection-move-confirmation",
      );
      await waitFor(() =>
        expect(
          within(confirmModal).getByRole("heading", { level: 3 }),
        ).toHaveTextContent(
          "Do you still want this question to appear in Blue Dashboard?",
        ),
      );
      expect(
        within(confirmModal).getByRole("radio", {
          name: "Yes, it should still appear there",
        }),
      ).toBeChecked();
      expect(
        within(confirmModal).getByRole("radio", {
          name: "No, remove it from that dashboard",
        }),
      ).not.toBeChecked();
      expect(getCardPutCalls()).toHaveLength(0);

      await userEvent.click(
        within(confirmModal).getByRole("button", { name: "Done" }),
      );

      await waitFor(() => expect(getCardPutCalls()).toHaveLength(1));
      const [request] = getCardPutRequests();
      expect(request.body).toMatchObject({
        collection_id: DESTINATION_COLLECTION.id,
        dashboard_id: null,
      });
      expect(request.deleteOldDashcards).not.toBe("true");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("moving a dashboard question to another dashboard", () => {
    it("warns that the question will be removed from its current dashboard and moves it on confirm", async () => {
      const { onClose } = setup({
        card: createDashboardQuestion(BLUE_DASHBOARD),
        dashboardResponseDelay: 250,
      });

      await chooseDestination(PURPLE_DASHBOARD.name);

      const confirmModal = await screen.findByTestId(
        "dashboard-to-dashboard-move-confirmation",
      );
      await waitFor(() =>
        expect(
          within(confirmModal).getByRole("heading", { level: 1 }),
        ).toHaveTextContent(
          "Moving this question to another dashboard will remove it from Blue Dashboard",
        ),
      );
      expect(getCardPutCalls()).toHaveLength(0);

      await userEvent.click(
        within(confirmModal).getByRole("button", { name: "Okay" }),
      );

      await waitFor(() => expect(getCardPutCalls()).toHaveLength(1));
      expect(getCardPutRequests()).toEqual([
        {
          body: expect.objectContaining({ dashboard_id: PURPLE_DASHBOARD.id }),
          deleteOldDashcards: "true",
        },
      ]);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByTestId("move-card-toast")).toHaveTextContent(
          "Question moved to Purple Dashboard",
        ),
      );
    });
  });

  describe("moving a collection question that appears in dashboards into a dashboard", () => {
    it("blocks moving a question from one inaccessible dashboard", async () => {
      const { onClose } = setup({
        card: createMockCard({
          id: CARD_ID,
          name: "Blue Question",
          dashboard_id: null,
          dashboard_count: 1,
        }),
        cardDashboards: [
          {
            card_id: CARD_ID,
            // The backend omits identity fields for unreadable dashboards.
            dashboards: [{ error: "unreadable-dashboard" }],
          },
        ],
      });

      await chooseDestination(ORANGE_DASHBOARD.name);

      expect(
        await screen.findByText("Can't move this question into a dashboard"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "This question currently appears in a dashboard that you don't have permission to edit.",
        ),
      ).toBeInTheDocument();
      const [preflight] = fetchMock.callHistory.calls(
        "path:/api/cards/dashboards",
      );
      const body: unknown = JSON.parse(String(preflight.options.body));
      expect(body).toEqual({ card_ids: [CARD_ID] });
      expect(getCardPutCalls()).toHaveLength(0);
      expect(
        screen.queryByRole("button", { name: "Move it" }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Okay" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(getCardPutCalls()).toHaveLength(0);
    });

    it("lists the affected dashboards, shows a failed move's error, and lets the user retry", async () => {
      const card = createMockCard({
        id: CARD_ID,
        name: "Blue Question",
        type: "question",
        collection_id: null,
        dashboard_id: null,
        dashboard_count: 2,
      });
      const { onClose } = setup({
        card,
        cardDashboards: [
          {
            card_id: CARD_ID,
            dashboards: [
              { id: BLUE_DASHBOARD.id, name: BLUE_DASHBOARD.name },
              { id: PURPLE_DASHBOARD.id, name: PURPLE_DASHBOARD.name },
            ],
          },
        ],
        updateCardError: { status: 400, body: { message: "Ryan said no" } },
        dashboardResponseDelay: 250,
      });

      await chooseDestination(ORANGE_DASHBOARD.name);

      expect(
        await screen.findByText("Move this question?"),
      ).toBeInTheDocument();
      expect(screen.getByRole("listitem")).toHaveTextContent(
        "Blue Question will be removed from Blue Dashboard and Purple Dashboard",
      );
      expect(getCardPutCalls()).toHaveLength(0);

      await userEvent.click(screen.getByRole("button", { name: "Move it" }));

      expect(await screen.findByText("Ryan said no")).toBeInTheDocument();
      expect(getCardPutCalls()).toHaveLength(1);
      expect(screen.getByText("Move this question?")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByText(/Question moved to/)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Move it" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(getCardPutCalls()).toHaveLength(2);
      const expectedRequest = {
        body: expect.objectContaining({ dashboard_id: ORANGE_DASHBOARD.id }),
        deleteOldDashcards: "true",
      };
      expect(getCardPutRequests()).toEqual([expectedRequest, expectedRequest]);
      await waitFor(() =>
        expect(screen.getByTestId("move-card-toast")).toHaveTextContent(
          "Question moved to Orange Dashboard",
        ),
      );
    });
  });
});
