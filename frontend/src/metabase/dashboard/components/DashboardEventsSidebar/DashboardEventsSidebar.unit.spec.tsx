import userEvent from "@testing-library/user-event";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { getSidebar } from "metabase/dashboard/selectors";
import { getDashCardVisibleTimelineEvents } from "metabase/dashboard/timeline-events";
import type { State, StoreDashcard } from "metabase/redux/store";
import {
  createMockApiState,
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
  seedApiQueryCache,
} from "metabase/redux/store/mocks";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  DashCardId,
  DashboardTabId,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboardCard,
  createMockDataset,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { DashboardEventsSidebar } from "./DashboardEventsSidebar";

registerVisualizations();

const DASHBOARD_ID = 1;
const COLLECTION = createMockCollection({ id: 7, name: "Releases" });

const SHORT_RANGE_DASHCARD_ID = 1;
const FULL_RANGE_DASHCARD_ID = 2;
const TABLE_DASHCARD_ID = 3;

const RC1 = createMockTimelineEvent({
  id: 101,
  timeline_id: 10,
  name: "RC1",
  timestamp: "2025-06-01T00:00:00",
});
const RC2 = createMockTimelineEvent({
  id: 102,
  timeline_id: 10,
  name: "RC2",
  timestamp: "2025-06-02T00:00:00",
});
const GA = createMockTimelineEvent({
  id: 103,
  timeline_id: 10,
  name: "GA",
  timestamp: "2025-06-20T00:00:00",
});

const TIMELINE = createMockTimeline({
  id: 10,
  name: "Releases",
  collection_id: COLLECTION.id,
  collection: COLLECTION,
  events: [RC1, RC2, GA],
});

const SHOWN: TimelineEventsVisibility = {
  "timeline.selected_timeline_ids": [TIMELINE.id],
  "timeline.excluded_timeline_event_ids": [],
};

const createTimeSeriesDataset = (dates: string[]) =>
  createMockDataset({
    data: {
      cols: [
        createMockDatetimeColumn({ name: "CREATED_AT", unit: "day" }),
        createMockNumericColumn({ name: "count" }),
      ],
      rows: dates.map((date, index) => [date, index]),
    },
  });

const createLineDashCard = ({
  id,
  visibility,
  tabId,
}: {
  id: DashCardId;
  visibility?: TimelineEventsVisibility;
  tabId?: DashboardTabId;
}) =>
  createMockDashboardCard({
    id,
    card_id: id,
    dashboard_tab_id: tabId ?? null,
    card: createMockCard({
      id,
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        ...visibility,
      },
    }),
  });

const SHORT_RANGE_DASHCARD = createLineDashCard({
  id: SHORT_RANGE_DASHCARD_ID,
  visibility: SHOWN,
});

const FULL_RANGE_DASHCARD = createLineDashCard({ id: FULL_RANGE_DASHCARD_ID });

const TABLE_DASHCARD = createMockDashboardCard({
  id: TABLE_DASHCARD_ID,
  card_id: TABLE_DASHCARD_ID,
  card: createMockCard({ id: TABLE_DASHCARD_ID, display: "table" }),
});

const DASHCARD_DATASETS = {
  [SHORT_RANGE_DASHCARD_ID]: {
    [SHORT_RANGE_DASHCARD_ID]: createTimeSeriesDataset([
      "2025-06-01",
      "2025-06-05",
    ]),
  },
  [FULL_RANGE_DASHCARD_ID]: {
    [FULL_RANGE_DASHCARD_ID]: createTimeSeriesDataset([
      "2025-06-01",
      "2025-06-30",
    ]),
  },
};

interface SetupOpts {
  dashcardId?: DashCardId;
  focusedEventIds?: TimelineEventId[];
  dashcards?: StoreDashcard[];
  selectedTabId?: DashboardTabId | null;
}

const setup = ({
  dashcardId,
  focusedEventIds,
  dashcards = [SHORT_RANGE_DASHCARD, FULL_RANGE_DASHCARD, TABLE_DASHCARD],
  selectedTabId = null,
}: SetupOpts = {}) => {
  setupCollectionByIdEndpoint({ collections: [COLLECTION] });

  const state = createMockState({
    dashboard: createMockDashboardState({
      dashboardId: DASHBOARD_ID,
      selectedTabId,
      dashboards: {
        [DASHBOARD_ID]: createMockStoreDashboard({
          id: DASHBOARD_ID,
          collection_id: COLLECTION.id,
          dashcards: dashcards.map((dashcard) => dashcard.id),
        }),
      },
      dashcards: Object.fromEntries(
        dashcards.map((dashcard) => [dashcard.id, dashcard]),
      ),
      dashcardData: DASHCARD_DATASETS,
      sidebar: {
        name: SIDEBAR_NAME.events,
        props: { dashcardId, focusedEventIds },
      },
    }),
    "metabase-api": seedApiQueryCache(createMockApiState(), [
      {
        endpointName: "listTimelines",
        arg: { include: "events" },
        value: [TIMELINE],
      },
    ]),
  });

  const { store } = renderWithProviders(
    <MockDashboardContext dashboardId={DASHBOARD_ID} withTimelineEvents>
      <DashboardEventsSidebar />
    </MockDashboardContext>,
    { storeInitialState: state },
  );

  return { store };
};

const getEventCheckbox = (eventName: string) =>
  within(
    checkNotNull(
      screen
        .getAllByLabelText("Timeline event card")
        .find((card) => within(card).queryByText(eventName) != null),
    ),
  ).getByRole("checkbox");

const getVisibleEventNames = (state: State, dashcardId: DashCardId) =>
  getDashCardVisibleTimelineEvents(state, dashcardId).map(
    (event) => event.name,
  );

describe("DashboardEventsSidebar", () => {
  describe("for the whole dashboard", () => {
    it("tells the user there is no chart that can show events", async () => {
      setup({ dashcards: [TABLE_DASHCARD] });

      expect(
        await screen.findByText(
          "Events can be displayed on time series charts",
        ),
      ).toBeInTheDocument();
    });

    it("lists the events of every timeline regardless of any chart's range", async () => {
      setup();

      expect(await screen.findByText("RC1")).toBeInTheDocument();
      expect(screen.getByText("RC2")).toBeInTheDocument();
      expect(screen.getByText("GA")).toBeInTheDocument();
    });

    it("marks an event that only some charts show as partially selected", async () => {
      setup();

      expect(await screen.findByText("RC1")).toBeInTheDocument();
      expect(getEventCheckbox("RC1")).toBePartiallyChecked();
    });

    it("turns a partially selected event on for every chart", async () => {
      const { store } = setup();

      expect(await screen.findByText("RC1")).toBeInTheDocument();
      await userEvent.click(getEventCheckbox("RC1"));

      await waitFor(() => {
        expect(getEventCheckbox("RC1")).toBeChecked();
      });
      expect(
        getVisibleEventNames(store.getState(), FULL_RANGE_DASHCARD_ID),
      ).toEqual(["RC1"]);
      expect(
        getVisibleEventNames(store.getState(), SHORT_RANGE_DASHCARD_ID),
      ).toContain("RC1");
    });
  });

  describe("for a single card", () => {
    it("titles the sidebar with the chart's date range", async () => {
      setup({ dashcardId: SHORT_RANGE_DASHCARD_ID });

      expect(
        await screen.findByText("Events between Jun 1, 2025 and Jun 5, 2025"),
      ).toBeInTheDocument();
    });

    it("lists only the events inside the chart's date range", async () => {
      setup({ dashcardId: SHORT_RANGE_DASHCARD_ID });

      expect(await screen.findByText("RC1")).toBeInTheDocument();
      expect(screen.getByText("RC2")).toBeInTheDocument();
      expect(screen.queryByText("GA")).not.toBeInTheDocument();
    });

    it("hides an event on that card only", async () => {
      const { store } = setup({ dashcardId: SHORT_RANGE_DASHCARD_ID });

      expect(await screen.findByText("RC1")).toBeInTheDocument();
      await userEvent.click(getEventCheckbox("RC1"));

      await waitFor(() => {
        expect(
          getVisibleEventNames(store.getState(), SHORT_RANGE_DASHCARD_ID),
        ).toEqual(["RC2", "GA"]);
      });
      expect(
        getVisibleEventNames(store.getState(), FULL_RANGE_DASHCARD_ID),
      ).toEqual([]);
    });

    it("shows only the focused events and restores the full list", async () => {
      setup({
        dashcardId: SHORT_RANGE_DASHCARD_ID,
        focusedEventIds: [RC2.id],
      });

      expect(await screen.findByText("RC2")).toBeInTheDocument();
      expect(screen.queryByText("RC1")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /All events/ }));

      expect(await screen.findByText("RC1")).toBeInTheDocument();
      expect(screen.getByText("RC2")).toBeInTheDocument();
    });

    it("closes when its card is removed", async () => {
      const { store } = setup({
        dashcardId: SHORT_RANGE_DASHCARD_ID,
        dashcards: [
          { ...SHORT_RANGE_DASHCARD, isRemoved: true },
          FULL_RANGE_DASHCARD,
        ],
      });

      await waitFor(() => {
        expect(getSidebar(store.getState()).name).toBeUndefined();
      });
    });

    it("closes when its card is on another tab", async () => {
      const { store } = setup({
        dashcardId: SHORT_RANGE_DASHCARD_ID,
        dashcards: [
          createLineDashCard({ id: SHORT_RANGE_DASHCARD_ID, tabId: 1 }),
          createLineDashCard({ id: FULL_RANGE_DASHCARD_ID, tabId: 2 }),
        ],
        selectedTabId: 2,
      });

      await waitFor(() => {
        expect(getSidebar(store.getState()).name).toBeUndefined();
      });
    });
  });
});
