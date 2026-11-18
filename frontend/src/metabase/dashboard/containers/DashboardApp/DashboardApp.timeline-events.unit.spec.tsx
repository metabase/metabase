import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type React from "react";
import type { ComponentType } from "react";
import _ from "underscore";

import {
  setupBookmarksEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  getTimelineCheckbox,
  getTimelineEventCheckbox,
} from "__support__/timelines";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { replaceCard } from "metabase/dashboard/actions";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationGridSize } from "metabase/viz-core";
import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  DashboardTab,
  Parameter,
  ParameterTarget,
  QuestionDashboardCard,
  Timeline,
  TimelineEvent,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockParameter,
  createMockTimeline,
  createMockTimelineEvent,
  createMockUser,
} from "metabase-types/api/mocks";

// jsdom has no layout, and the global mock sizes every chart 1000x1000. This one sizes a
// dashboard chart from its grid size instead, so a small card measures as small.
jest.mock("metabase/common/components/ExplicitSize", () => {
  const { forwardRef }: typeof React = jest.requireActual("react");
  const PIXELS_PER_GRID_UNIT = 60;
  const getPixels = (props: object, dimension: "width" | "height") => {
    const gridSize: Partial<VisualizationGridSize> | undefined =
      "gridSize" in props && props.gridSize != null
        ? Object(props.gridSize)
        : undefined;
    const units = gridSize?.[dimension];
    return units != null ? units * PIXELS_PER_GRID_UNIT : 1000;
  };
  return {
    ExplicitSize:
      () =>
      <P extends object>(ComposedComponent: ComponentType<P>) =>
        forwardRef<unknown, P>(function WrappedComponent(props, ref) {
          return (
            <ComposedComponent
              ref={ref}
              width={getPixels(props, "width")}
              height={getPixels(props, "height")}
              {...props}
            />
          );
        }),
  };
});

registerVisualizations();
registerDashboardVisualizations();

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const DATABASE = createMockDatabase();
const DASHBOARD_ID = 1;

const RELEASES_ID = 10;
const LAUNCHES_ID = 20;

const createEvent = (opts: Partial<TimelineEvent>) =>
  createMockTimelineEvent({ timeline_id: RELEASES_ID, ...opts });

const RC1 = createEvent({
  id: 100,
  name: "RC1",
  timestamp: "2027-10-20T00:00:00Z",
});
const STABLE_RELEASE = createEvent({
  id: 101,
  name: "Stable release",
  timestamp: "2028-01-15T00:00:00Z",
});
const ALPHA = createEvent({
  id: 102,
  name: "Alpha",
  timestamp: "2027-10-03T00:00:00Z",
});
const BETA = createEvent({
  id: 103,
  name: "Beta",
  timestamp: "2027-10-10T00:00:00Z",
});
const GA = createEvent({
  id: 200,
  timeline_id: LAUNCHES_ID,
  name: "GA",
  timestamp: "2027-11-20T00:00:00Z",
});

const WRITABLE_ROOT = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: true,
});

const createTimeline = (opts: Partial<Timeline>) =>
  createMockTimeline({
    collection_id: null,
    collection: WRITABLE_ROOT,
    ...opts,
  });

const createReleases = (events: TimelineEvent[] = [RC1]) =>
  createTimeline({ id: RELEASES_ID, name: "Releases", events });

const LAUNCHES = createTimeline({
  id: LAUNCHES_ID,
  name: "Launches",
  events: [GA],
});

const EMPTY_TIMELINE = createTimeline({
  id: 30,
  name: "Empty timeline",
  events: [],
});

type Rows = [string, number][];

const MONTHLY_ROWS: Rows = [
  ["2027-08-01T00:00:00Z", 1],
  ["2027-09-01T00:00:00Z", 2],
  ["2027-10-01T00:00:00Z", 3],
  ["2027-11-01T00:00:00Z", 4],
  ["2027-12-01T00:00:00Z", 5],
  ["2028-01-01T00:00:00Z", 6],
  ["2028-02-01T00:00:00Z", 7],
];

// what the date filter leaves of the chart
const OCTOBER_TO_NOVEMBER_ROWS: Rows = [
  ["2027-10-01T00:00:00Z", 3],
  ["2027-11-01T00:00:00Z", 4],
];

// a question whose own range stops before the release
const BEFORE_RELEASE_ROWS: Rows = [
  ["2026-10-01T00:00:00Z", 1],
  ["2026-11-01T00:00:00Z", 2],
  ["2026-12-01T00:00:00Z", 3],
];

const createMonthlyDataset = (rows: Rows) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockDatetimeColumn({
          name: "CREATED_AT",
          display_name: "Created At: Month",
          unit: "month",
        }),
        createMockNumericColumn({ name: "count", display_name: "Count" }),
      ],
      rows,
    }),
  });

const RELEASES_SELECTED: VisualizationSettings = {
  "timeline.selected_timeline_ids": [RELEASES_ID],
};

const createTimeSeriesCard = (opts: Partial<Card> = {}) =>
  createMockCard({
    id: 1,
    name: "Orders by month",
    display: "line",
    visualization_settings: RELEASES_SELECTED,
    ...opts,
  });

const createPlacement = (
  card: Card,
  opts: Partial<QuestionDashboardCard> & { title?: string } = {},
): QuestionDashboardCard => {
  const { title, ...dashcardOpts } = opts;
  return createMockDashboardCard({
    card_id: card.id,
    card,
    size_x: 12,
    size_y: 6,
    visualization_settings: title ? { "card.title": title } : {},
    ...dashcardOpts,
  });
};

const OVERVIEW_TAB = createMockDashboardTab({
  id: 1,
  dashboard_id: DASHBOARD_ID,
  name: "Overview",
});
const HISTORY_TAB = createMockDashboardTab({
  id: 2,
  dashboard_id: DASHBOARD_ID,
  name: "History",
});

const DASHCARD_QUERY_URL =
  /\/api\/dashboard\/(\d+)\/dashcard\/(\d+)\/card\/(\d+)\/query$/;

interface SetupOpts {
  dashcards: QuestionDashboardCard[];
  tabs?: DashboardTab[];
  parameters?: Parameter[];
  timelines?: Timeline[];
  extraCards?: Card[];
  rowsByCardId?: Record<CardId, Rows>;
  filter?: { parameter: unknown; rows: Rows };
  initialQuery?: string;
}

function setup({
  dashcards,
  tabs = [],
  parameters = [],
  timelines = [createReleases()],
  extraCards = [],
  rowsByCardId = {},
  filter,
  initialQuery = "",
}: SetupOpts) {
  const cards = _.uniq(
    [
      ...dashcards.flatMap((dashcard) => [
        dashcard.card,
        ...(dashcard.series ?? []),
      ]),
      ...extraCards,
    ],
    false,
    (card) => card.id,
  );
  const getRows = (cardId: CardId) => rowsByCardId[cardId] ?? MONTHLY_ROWS;
  const dashboard: Dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    name: "Events dashboard",
    collection_id: null,
    dashcards,
    tabs,
    parameters,
  });
  let storedDashcards = dashcards;
  let storedTimelines = timelines;

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([DATABASE]);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [DATABASE] }),
  );
  setupCollectionsEndpoints({ collections: [] });
  setupCollectionByIdEndpoint({ collections: [WRITABLE_ROOT] });
  setupCardsEndpoints(cards);
  cards.forEach((card) =>
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [DATABASE] }),
    ),
  );
  setupBookmarksEndpoints([]);
  setupLastDownloadFormatEndpoints();

  const getStoredDashboard = () => ({
    ...dashboard,
    dashcards: storedDashcards,
  });
  fetchMock.get(`path:/api/dashboard/${DASHBOARD_ID}`, getStoredDashboard, {
    name: "get-dashboard",
  });
  fetchMock.put(
    `path:/api/dashboard/${DASHBOARD_ID}`,
    async (call) => {
      const body: { dashcards?: DashboardCard[] } = JSON.parse(
        String(call.options.body),
      );
      if (body.dashcards) {
        const savedIds = body.dashcards.map((dashcard) => dashcard.id);
        const savedCardIds = new Map(
          body.dashcards.map((dashcard) => [dashcard.id, dashcard.card_id]),
        );
        storedDashcards = storedDashcards
          .filter((dashcard) => savedIds.includes(dashcard.id))
          .map((dashcard) => {
            const card = cards.find(
              ({ id }) => id === savedCardIds.get(dashcard.id),
            );
            return card ? { ...dashcard, card_id: card.id, card } : dashcard;
          });
      }
      return getStoredDashboard();
    },
    { name: "save-dashboard" },
  );
  // like the backend, a timeline carries its events only when the request asks for them
  fetchMock.get(
    "path:/api/timeline",
    (call) =>
      new URL(call.url).searchParams.get("include") === "events"
        ? storedTimelines
        : storedTimelines.map(({ events: _events, ...timeline }) => timeline),
    { name: "list-timelines" },
  );
  fetchMock.post(
    "path:/api/timeline-event",
    (call) => {
      const body: TimelineEvent = JSON.parse(String(call.options.body));
      const created = createMockTimelineEvent({ ...body, id: 999 });
      storedTimelines = storedTimelines.map((timeline) =>
        timeline.id === body.timeline_id
          ? { ...timeline, events: [...(timeline.events ?? []), created] }
          : timeline,
      );
      return created;
    },
    { name: "create-event" },
  );
  fetchMock.post(
    DASHCARD_QUERY_URL,
    (call) => {
      const [, dashboardId, dashcardId, cardId] =
        call.url.match(DASHCARD_QUERY_URL) ?? [];
      // like the backend, answer only a card that the addressed placement shows,
      // either as its question or as an added series
      const placement = storedDashcards.find(
        (dashcard) => dashcard.id === Number(dashcardId),
      );
      const placementCardIds = [
        placement?.card_id,
        ...(placement?.series ?? []).map((series) => series.id),
      ];
      if (
        Number(dashboardId) !== DASHBOARD_ID ||
        !placementCardIds.includes(Number(cardId))
      ) {
        return { status: 404 };
      }
      const body: { parameters?: unknown[] } = JSON.parse(
        String(call.options.body ?? "{}"),
      );
      // only the complete parameter (id, type, value and mapped target) filters the rows
      const isFiltered =
        filter != null &&
        (body.parameters ?? []).some((parameter) =>
          _.isEqual(parameter, filter.parameter),
        );
      return createMonthlyDataset(
        isFiltered ? filter.rows : getRows(Number(cardId)),
      );
    },
    { name: "dashcard-query" },
  );
  cards.forEach((card) => {
    fetchMock.post(
      `path:/api/card/${card.id}/query`,
      () => createMonthlyDataset(getRows(card.id)),
      { name: `card-query-${card.id}` },
    );
  });

  // a fresh store, like a page reload
  const renderApp = () =>
    renderWithProviders(
      <Route path="/dashboard/:slug" element={<DashboardApp />} />,
      {
        initialRoute: `/dashboard/${DASHBOARD_ID}${initialQuery}`,
        withRouter: true,
        withUndos: true,
        storeInitialState: {
          currentUser: createMockUser(),
          dashboard: createMockDashboardState(),
          entities: createMockEntitiesState({ databases: [DATABASE] }),
          settings: mockSettings({ "site-url": "http://localhost:3000" }),
        },
      },
    );

  return { ...renderApp(), renderApp };
}

const getDashCard = (title: string) => {
  const dashcard = screen
    .getAllByTestId("dashcard")
    .find((element) => within(element).queryAllByText(title).length > 0);
  if (!dashcard) {
    throw new Error(`No dashcard titled ${title}`);
  }
  return dashcard;
};

const findDashCard = (title: string) => waitFor(() => getDashCard(title));

const findEventChip = async (title: string, name: string) =>
  within(await findDashCard(title)).findByRole("button", { name });

const getEventChip = (title: string, name: string) =>
  within(getDashCard(title)).getByRole("button", { name });

const queryEventChip = (title: string, name: string) =>
  within(getDashCard(title)).queryByRole("button", { name });

// menu items are named after their icon too
const EVENTS_MENU_ITEM = /(^|\s)Events$/;

const getEventsSidebar = () => screen.getByTestId("dashboard-events-sidebar");

const queryEventsSidebar = () =>
  screen.queryByTestId("dashboard-events-sidebar");

const findEventsSidebar = () => screen.findByTestId("dashboard-events-sidebar");

const openDashboardEvents = async () => {
  await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: EVENTS_MENU_ITEM }),
  );
  return findEventsSidebar();
};

const openDashCardMenu = async (title: string) => {
  await userEvent.click(
    within(getDashCard(title)).getByRole("button", { name: "More options" }),
  );
  return screen.findByRole("menu");
};

const getTrackedEvents = (event: string) =>
  trackSimpleEvent.mock.calls
    .map(([payload]: [{ event: string }]) => payload)
    .filter((payload: { event: string }) => payload.event === event);

describe("DashboardApp > timeline events", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 800, height: 400 });
    trackSimpleEvent.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("selects single and grouped chips on one copy of a question and focuses the matching panel entries", async () => {
    const card = createTimeSeriesCard();
    setup({
      dashcards: [
        createPlacement(card, { id: 1, title: "Copy A" }),
        createPlacement(card, { id: 2, col: 12, title: "Copy B" }),
      ],
      timelines: [createReleases([ALPHA, BETA, STABLE_RELEASE])],
    });
    await waitForDashboardToLoad();

    await userEvent.click(await findEventChip("Copy B", "2 events"));

    expect(getEventChip("Copy B", "2 events")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(getEventChip("Copy A", "2 events")).toHaveAttribute(
      "data-selected",
      "false",
    );
    const sidebar = await findEventsSidebar();
    expect(await within(sidebar).findByText("Alpha")).toBeInTheDocument();
    expect(within(sidebar).getByText("Beta")).toBeInTheDocument();
    expect(
      within(sidebar).queryByText("Stable release"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(sidebar).getByRole("button", { name: /All events/ }),
    );
    expect(
      await within(getEventsSidebar()).findByText("Stable release"),
    ).toBeInTheDocument();

    await userEvent.click(getEventChip("Copy B", "Stable release"));

    expect(getEventChip("Copy B", "Stable release")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(getEventChip("Copy B", "2 events")).toHaveAttribute(
      "data-selected",
      "false",
    );
    expect(getEventChip("Copy A", "Stable release")).toHaveAttribute(
      "data-selected",
      "false",
    );
    expect(
      within(getEventsSidebar()).getByText("Stable release"),
    ).toBeInTheDocument();
    expect(within(getEventsSidebar()).getByText("Alpha")).toBeInTheDocument();
    expect(
      within(getEventsSidebar()).queryByRole("button", { name: /All events/ }),
    ).not.toBeInTheDocument();
  });

  it("closes the targeted panel and clears the selection when switching tabs, editing, and removing a card", async () => {
    const card = createTimeSeriesCard();
    setup({
      tabs: [OVERVIEW_TAB, HISTORY_TAB],
      dashcards: [
        createPlacement(card, {
          id: 1,
          dashboard_tab_id: OVERVIEW_TAB.id,
          title: "Copy A",
        }),
        createPlacement(card, {
          id: 2,
          col: 12,
          dashboard_tab_id: OVERVIEW_TAB.id,
          title: "Copy B",
        }),
        createPlacement(card, {
          id: 3,
          dashboard_tab_id: HISTORY_TAB.id,
          title: "Copy C",
        }),
      ],
    });
    await waitForDashboardToLoad();

    await userEvent.click(await findEventChip("Copy B", "RC1"));
    expect(await findEventsSidebar()).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(await findEventChip("Copy C", "RC1")).toHaveAttribute(
      "data-selected",
      "false",
    );
    await waitFor(() => expect(queryEventsSidebar()).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(await findEventChip("Copy B", "RC1")).toHaveAttribute(
      "data-selected",
      "false",
    );
    await userEvent.click(getEventChip("Copy B", "RC1"));
    expect(await findEventsSidebar()).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Edit dashboard"));
    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(queryEventsSidebar()).not.toBeInTheDocument());

    await userEvent.click(
      within(getDashCard("Copy A")).getByLabelText("close icon"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByText("Copy A")).not.toBeInTheDocument(),
    );
    const saveCall = fetchMock.callHistory.lastCall("save-dashboard");
    expect(
      JSON.parse(String(saveCall?.options.body)).dashcards.map(
        ({ id }: DashboardCard) => id,
      ),
    ).toEqual([2, 3]);
    expect(await findEventChip("Copy B", "RC1")).toHaveAttribute(
      "data-selected",
      "false",
    );
    expect(queryEventsSidebar()).not.toBeInTheDocument();

    await userEvent.click(getEventChip("Copy B", "RC1"));
    expect(
      await within(await findEventsSidebar()).findByText("RC1"),
    ).toBeInTheDocument();
  });

  it("applies mixed dashboard event choices only to eligible cards on the current tab", async () => {
    const card = createTimeSeriesCard();
    const table = createTimeSeriesCard({
      id: 2,
      name: "Orders table",
      display: "table",
    });
    setup({
      tabs: [OVERVIEW_TAB, HISTORY_TAB],
      dashcards: [
        createPlacement(card, {
          id: 1,
          dashboard_tab_id: OVERVIEW_TAB.id,
          title: "Copy A",
        }),
        createPlacement(card, {
          id: 2,
          col: 12,
          dashboard_tab_id: OVERVIEW_TAB.id,
          title: "Copy B",
        }),
        createPlacement(card, {
          id: 3,
          dashboard_tab_id: HISTORY_TAB.id,
          title: "Copy C",
        }),
        createPlacement(table, {
          id: 4,
          row: 7,
          dashboard_tab_id: OVERVIEW_TAB.id,
        }),
      ],
    });
    await waitForDashboardToLoad();

    await userEvent.click(await findEventChip("Copy B", "RC1"));
    await findEventsSidebar();
    await userEvent.click(
      await waitFor(() => getTimelineEventCheckbox(RC1.name)),
    );
    await waitFor(() =>
      expect(queryEventChip("Copy B", "RC1")).not.toBeInTheDocument(),
    );
    expect(getEventChip("Copy A", "RC1")).toBeInTheDocument();
    await userEvent.click(within(getEventsSidebar()).getByLabelText("Close"));

    await openDashboardEvents();
    const checkbox = await waitFor(() => getTimelineEventCheckbox(RC1.name));
    expect(checkbox).toBePartiallyChecked();

    await userEvent.click(checkbox);
    expect(getTimelineEventCheckbox(RC1.name)).toBeChecked();
    expect(getTimelineEventCheckbox(RC1.name)).not.toBePartiallyChecked();
    expect(await findEventChip("Copy B", "RC1")).toBeInTheDocument();
    expect(getEventChip("Copy A", "RC1")).toBeInTheDocument();
    expect(
      within(getDashCard("Orders table")).getByText("Orders table"),
    ).toBeInTheDocument();
    expect(
      within(getDashCard("Orders table")).queryByTestId("timeline-events-band"),
    ).not.toBeInTheDocument();

    await userEvent.click(getTimelineEventCheckbox(RC1.name));
    expect(getTimelineEventCheckbox(RC1.name)).not.toBeChecked();
    await waitFor(() =>
      expect(queryEventChip("Copy A", "RC1")).not.toBeInTheDocument(),
    );
    expect(queryEventChip("Copy B", "RC1")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(await findEventChip("Copy C", "RC1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    await findDashCard("Copy A");
    await waitFor(() =>
      expect(
        within(getDashCard("Copy A")).getByTestId("chart-container"),
      ).toBeInTheDocument(),
    );
    expect(queryEventChip("Copy A", "RC1")).not.toBeInTheDocument();
    expect(queryEventChip("Copy B", "RC1")).not.toBeInTheDocument();
  });

  it("does not offer events on a card too small to show them", async () => {
    const card = createTimeSeriesCard();
    setup({
      dashcards: [
        createPlacement(card, { id: 1, title: "Large chart" }),
        createPlacement(card, {
          id: 2,
          row: 6,
          size_x: 4,
          size_y: 3,
          title: "Small chart",
        }),
      ],
    });
    await waitForDashboardToLoad();

    expect(await findEventChip("Large chart", "RC1")).toBeInTheDocument();
    const largeMenu = await openDashCardMenu("Large chart");
    expect(
      within(largeMenu).getByRole("menuitem", { name: EVENTS_MENU_ITEM }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );

    await waitFor(() =>
      expect(
        within(getDashCard("Small chart")).getByTestId("chart-container"),
      ).toBeInTheDocument(),
    );
    expect(
      within(getDashCard("Small chart")).queryByTestId("timeline-event-chip"),
    ).not.toBeInTheDocument();
    const smallMenu = await openDashCardMenu("Small chart");
    expect(
      within(smallMenu).getByRole("menuitem", { name: /Download results$/ }),
    ).toBeInTheDocument();
    expect(
      within(smallMenu).queryByRole("menuitem", { name: EVENTS_MENU_ITEM }),
    ).not.toBeInTheDocument();
  });

  it("filters chips and panel entries with the chart's date range", async () => {
    const card = createTimeSeriesCard();
    const parameter = createMockParameter({
      id: "date",
      name: "Date",
      slug: "date",
      type: "date/range",
    });
    const target: ParameterTarget = [
      "dimension",
      ["field", 1, { "base-type": "type/DateTime" }],
    ];
    setup({
      parameters: [parameter],
      dashcards: [
        createPlacement(card, {
          id: 1,
          parameter_mappings: [
            { parameter_id: parameter.id, card_id: card.id, target },
          ],
        }),
      ],
      timelines: [createReleases([RC1, STABLE_RELEASE])],
      filter: {
        parameter: {
          id: "date",
          type: "date/range",
          value: "2027-10-01~2027-11-30",
          target,
        },
        rows: OCTOBER_TO_NOVEMBER_ROWS,
      },
    });
    await waitForDashboardToLoad();

    expect(await findEventChip(card.name, "RC1")).toBeInTheDocument();
    expect(getEventChip(card.name, "Stable release")).toBeInTheDocument();

    await userEvent.click(
      within(
        screen.getByTestId("dashboard-parameters-widget-container"),
      ).getByText("Date"),
    );
    const popover = await screen.findByRole("dialog");
    const startDate = within(popover).getByLabelText("Start date");
    await userEvent.clear(startDate);
    await userEvent.type(startDate, "10/01/2027");
    const endDate = within(popover).getByLabelText("End date");
    await userEvent.clear(endDate);
    await userEvent.type(endDate, "11/30/2027");
    await userEvent.click(
      within(popover).getByRole("button", { name: "Add filter" }),
    );

    // wait for the filtered chart to render before checking what it leaves out
    await waitFor(() =>
      expect(
        fetchMock.callHistory
          .calls("dashcard-query")
          .some((call) =>
            JSON.parse(String(call.options.body)).parameters?.some(
              (parameter: { value?: unknown }) => parameter.value != null,
            ),
          ),
      ).toBe(true),
    );
    expect(await findEventChip(card.name, "RC1")).toBeInTheDocument();
    expect(queryEventChip(card.name, "Stable release")).not.toBeInTheDocument();
    const filteredQuery = fetchMock.callHistory.lastCall("dashcard-query");
    expect(JSON.parse(String(filteredQuery?.options.body)).parameters).toEqual([
      {
        id: "date",
        type: "date/range",
        value: "2027-10-01~2027-11-30",
        target,
      },
    ]);
    await userEvent.click(getEventChip(card.name, "RC1"));
    const sidebar = await findEventsSidebar();
    expect(await within(sidebar).findByText("RC1")).toBeInTheDocument();
    expect(
      within(sidebar).queryByText("Stable release"),
    ).not.toBeInTheDocument();
    await userEvent.click(within(sidebar).getByLabelText("Close"));

    await userEvent.click(
      within(
        screen.getByTestId("dashboard-parameters-widget-container"),
      ).getByRole("button", { name: "Clear" }),
    );

    expect(
      await findEventChip(card.name, "Stable release"),
    ).toBeInTheDocument();
    expect(getEventChip(card.name, "RC1")).toBeInTheDocument();
    const unfilteredQuery = fetchMock.callHistory.lastCall("dashcard-query");
    expect(
      (JSON.parse(String(unfilteredQuery?.options.body)).parameters ?? []).some(
        (parameter: { value?: unknown }) => parameter.value != null,
      ),
    ).toBe(false);
    expect(
      within(getDashCard(card.name)).getByText("Created At: Month"),
    ).toBeInTheDocument();
  });

  it("shows an event that only the card's added series reaches", async () => {
    const card = createTimeSeriesCard({ name: "Orders before the release" });
    const series = createTimeSeriesCard({
      id: 2,
      name: "Orders by month",
      visualization_settings: {},
    });
    setup({
      // a placement id that matches neither card, so a query cannot address it by accident
      dashcards: [createPlacement(card, { id: 7, series: [series] })],
      rowsByCardId: { [card.id]: BEFORE_RELEASE_ROWS },
    });
    await waitForDashboardToLoad();

    await userEvent.click(
      await findEventChip("Orders before the release", "RC1"),
    );
    expect(
      await within(await findEventsSidebar()).findByText("RC1"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory
        .calls("dashcard-query")
        .map((call) => new URL(call.url).pathname)
        .sort(),
    ).toEqual([
      `/api/dashboard/${DASHBOARD_ID}/dashcard/7/card/${card.id}/query`,
      `/api/dashboard/${DASHBOARD_ID}/dashcard/7/card/${series.id}/query`,
    ]);
  });

  it("shows the replacing question's events after replacing a card", async () => {
    const card = createTimeSeriesCard();
    const replacement = createTimeSeriesCard({
      id: 2,
      name: "Orders by month, launches",
      visualization_settings: {
        "timeline.selected_timeline_ids": [LAUNCHES_ID],
      },
    });
    const { store } = setup({
      dashcards: [createPlacement(card, { id: 1 })],
      timelines: [createReleases(), LAUNCHES],
      extraCards: [replacement],
    });
    await waitForDashboardToLoad();

    await userEvent.click(await findEventChip(card.name, "RC1"));
    expect(await findEventsSidebar()).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Edit dashboard"));
    await act(async () => {
      await store.dispatch(
        replaceCard({ dashcardId: 1, nextCardId: replacement.id }),
      );
    });
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(`card-query-${replacement.id}`),
      ).toHaveLength(1),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await findEventChip(replacement.name, "GA")).toBeInTheDocument();
    expect(queryEventChip(replacement.name, "RC1")).not.toBeInTheDocument();
    await userEvent.click(getEventChip(replacement.name, "GA"));
    await findEventsSidebar();
    await waitFor(() => expect(getTimelineCheckbox("Launches")).toBeChecked());
    expect(getTimelineCheckbox("Releases")).not.toBeChecked();
  });

  it.each(["metric", "model"] as const)(
    "shows the events of a %s",
    async (type) => {
      const regular = createTimeSeriesCard({ name: "Orders question" });
      const typed = createTimeSeriesCard({
        id: 2,
        name: `Orders ${type}`,
        type,
      });
      setup({
        dashcards: [
          createPlacement(regular, { id: 1 }),
          createPlacement(typed, { id: 2, row: 6 }),
        ],
      });
      await waitForDashboardToLoad();

      expect(await findEventChip("Orders question", "RC1")).toBeInTheDocument();
      await userEvent.click(await findEventChip(`Orders ${type}`, "RC1"));
      expect(
        await within(await findEventsSidebar()).findByText("RC1"),
      ).toBeInTheDocument();
    },
  );

  it("keeps events for another time series display and does not list timelines without events", async () => {
    const card = createTimeSeriesCard({ display: "area" });
    setup({
      dashcards: [createPlacement(card, { id: 1 })],
      timelines: [createReleases(), EMPTY_TIMELINE],
    });
    await waitForDashboardToLoad();

    expect(await findEventChip(card.name, "RC1")).toBeInTheDocument();
    const sidebar = await openDashboardEvents();
    expect(await within(sidebar).findByText("Releases")).toBeInTheDocument();
    expect(
      within(sidebar).queryByText("Empty timeline"),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "a question that is no longer a time series",
      dashcard: createPlacement(createTimeSeriesCard({ display: "table" }), {
        id: 1,
      }),
      findRendered: () => screen.findByRole("grid"),
    },
    {
      name: "a card visualized another way",
      dashcard: createPlacement(createTimeSeriesCard(), {
        id: 1,
        visualization_settings: {
          visualization: {
            display: "area",
            columnValuesMapping: {
              COLUMN_1: [
                {
                  sourceId: "card:1",
                  originalName: "CREATED_AT",
                  name: "COLUMN_1",
                },
              ],
              COLUMN_2: [
                { sourceId: "card:1", originalName: "count", name: "COLUMN_2" },
              ],
            },
            settings: {
              "graph.dimensions": ["COLUMN_1"],
              "graph.metrics": ["COLUMN_2"],
            },
          },
        },
      }),
      findRendered: () => screen.findByTestId("chart-container"),
    },
  ])("does not show events on $name", async ({ dashcard, findRendered }) => {
    setup({ dashcards: [dashcard] });
    await waitForDashboardToLoad();

    expect(await findRendered()).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-event-chip")).not.toBeInTheDocument();
    await openDashboardEvents();
    expect(
      await screen.findByTestId("dashboard-events-empty-state"),
    ).toBeInTheDocument();
    expect(screen.queryByText("RC1")).not.toBeInTheDocument();
  });

  it("shows the whole timeline when creating an event on a hidden timeline", async () => {
    const card = createTimeSeriesCard({ visualization_settings: {} });
    setup({ dashcards: [createPlacement(card, { id: 1 })] });
    await waitForDashboardToLoad();
    await waitFor(() =>
      expect(
        within(getDashCard(card.name)).getByTestId("chart-container"),
      ).toBeInTheDocument(),
    );

    const sidebar = await openDashboardEvents();
    await waitFor(() =>
      expect(getTimelineEventCheckbox(RC1.name)).not.toBeChecked(),
    );
    expect(queryEventChip(card.name, "RC1")).not.toBeInTheDocument();

    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Create event" }),
    );
    await createEventInModal("RC2", "12/15/2027");

    const createCall = fetchMock.callHistory.lastCall("create-event");
    expect(JSON.parse(String(createCall?.options.body))).toMatchObject({
      name: "RC2",
      timeline_id: RELEASES_ID,
      source: "dashboard",
      timestamp: expect.stringMatching(/^2027-12-15/),
    });
    // the created event is listed once the timelines are fetched again
    await waitFor(() => expect(getTimelineEventCheckbox("RC2")).toBeChecked());
    expect(getTimelineCheckbox("Releases")).toBeChecked();
    expect(getTimelineEventCheckbox("RC1")).toBeChecked();
    expect(await findEventChip(card.name, "RC1")).toBeInTheDocument();
    expect(await findEventChip(card.name, "RC2")).toBeInTheDocument();
  });

  it("tracks a dashboard showing events once per load", async () => {
    const card = createTimeSeriesCard();
    const dashcards = [
      createPlacement(card, { id: 1, title: "Copy A" }),
      createPlacement(card, { id: 2, col: 12, title: "Copy B" }),
    ];
    const { unmount, renderApp } = setup({ dashcards });
    await waitForDashboardToLoad();
    expect(await findEventChip("Copy A", "RC1")).toBeInTheDocument();
    expect(await findEventChip("Copy B", "RC1")).toBeInTheDocument();
    expect(getTrackedEvents("dashboard_events_shown")).toEqual([
      { event: "dashboard_events_shown", target_id: DASHBOARD_ID },
    ]);

    const sidebar = await openDashboardEvents();
    expect(getTrackedEvents("dashboard_events_panel_opened")).toEqual([
      {
        event: "dashboard_events_panel_opened",
        target_id: DASHBOARD_ID,
        triggered_from: "dashboard_menu",
      },
    ]);

    await userEvent.click(
      await waitFor(() => getTimelineEventCheckbox(RC1.name)),
    );
    await waitFor(() =>
      expect(queryEventChip("Copy A", "RC1")).not.toBeInTheDocument(),
    );
    expect(queryEventChip("Copy B", "RC1")).not.toBeInTheDocument();
    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "dashboard_events_visibility_changed",
      target_id: DASHBOARD_ID,
      triggered_from: "dashboard",
      event_detail: "hidden",
    });

    await userEvent.click(getTimelineEventCheckbox(RC1.name));
    expect(await findEventChip("Copy A", "RC1")).toBeInTheDocument();
    expect(await findEventChip("Copy B", "RC1")).toBeInTheDocument();
    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "dashboard_events_visibility_changed",
      target_id: DASHBOARD_ID,
      triggered_from: "dashboard",
      event_detail: "shown",
    });
    expect(getTrackedEvents("dashboard_events_shown")).toHaveLength(1);

    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Create event" }),
    );
    await createEventInModal("RC2", "01/15/2028");
    expect(await findEventChip("Copy A", "RC2")).toBeInTheDocument();
    expect(await findEventChip("Copy B", "RC2")).toBeInTheDocument();
    expect(
      JSON.parse(
        String(fetchMock.callHistory.lastCall("create-event")?.options.body),
      ),
    ).toMatchObject({ name: "RC2", source: "dashboard" });
    expect(getTrackedEvents("dashboard_events_shown")).toHaveLength(1);

    unmount();
    renderApp();
    await waitForDashboardToLoad();
    expect(await findEventChip("Copy A", "RC1")).toBeInTheDocument();
    expect(await findEventChip("Copy B", "RC1")).toBeInTheDocument();
    expect(getTrackedEvents("dashboard_events_shown")).toEqual([
      { event: "dashboard_events_shown", target_id: DASHBOARD_ID },
      { event: "dashboard_events_shown", target_id: DASHBOARD_ID },
    ]);
  });
});

async function createEventInModal(name: string, date: string) {
  const modal = await screen.findByRole("dialog");
  await userEvent.type(within(modal).getByLabelText("Event name"), name);
  const dateInput = within(modal).getByLabelText("Date");
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, date);
  await userEvent.click(within(modal).getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}
