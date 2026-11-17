import fetchMock from "fetch-mock";

import {
  setupEmbedQuestionEndpoints,
  setupPublicCardQueryEndpoints,
  setupPublicQuestionEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import * as embeddingConfig from "metabase/embedding/config";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockEmbedDataset,
  createMockPublicCard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { PublicOrEmbeddedQuestion } from "../PublicOrEmbeddedQuestion";

// The other specs here mock the visualization; these need the real chart to see its events.
registerVisualizations();

const UUID = "00000000-0000-4000-8000-000000000000";
const TOKEN = "embed-token";
const TIMELINE_ID = 10;

const RELEASES = createMockTimeline({
  id: TIMELINE_ID,
  name: "Releases",
  events: [
    createMockTimelineEvent({
      id: 100,
      timeline_id: TIMELINE_ID,
      name: "RC1",
      timestamp: "2027-10-20T00:00:00Z",
    }),
  ],
});

const CARD_DETAILS = {
  name: "Orders by month",
  display: "line" as const,
  visualization_settings: {
    "timeline.selected_timeline_ids": [TIMELINE_ID],
  },
};

const PUBLIC_CARD = createMockPublicCard(CARD_DETAILS);

const EMBED_CARD = createMockCard(CARD_DETAILS);

const DATASET = createMockEmbedDataset({
  data: {
    cols: [
      createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At: Month",
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
        unit: "month",
        source: "breakout",
      }),
      createMockColumn({
        name: "count",
        display_name: "Count",
        base_type: "type/Integer",
        effective_type: "type/Integer",
        semantic_type: "type/Quantity",
        source: "aggregation",
      }),
    ],
    rows: [
      ["2027-08-01T00:00:00Z", 1],
      ["2027-09-01T00:00:00Z", 2],
      ["2027-10-01T00:00:00Z", 3],
      ["2027-11-01T00:00:00Z", 4],
      ["2027-12-01T00:00:00Z", 5],
    ],
  },
});

// public routes send `/api/timeline` requests to `/api/public/timeline`, so match any prefix
const TIMELINE_API_PATH = /^\/api\/([a-z_]+\/)?timeline/;

const getTimelineRequests = () =>
  fetchMock.callHistory
    .calls()
    .map((call) => call.url)
    .filter((url) => TIMELINE_API_PATH.test(new URL(url).pathname));

describe("PublicOrEmbeddedQuestion > timeline events", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 800, height: 400 });
    // requests the question must not make; answered so that making one would show the event
    setupTimelinesEndpoints([RELEASES]);
    fetchMock.get("path:/api/public/timeline", [RELEASES]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      surface: "a public question",
      route: "public/question/:uuid",
      path: `public/question/${UUID}`,
      setupSurface: () => {
        jest.spyOn(embeddingConfig, "isPublicEmbedding").mockReturnValue(true);
        setupPublicQuestionEndpoints(UUID, PUBLIC_CARD);
        setupPublicCardQueryEndpoints(UUID, DATASET);
      },
    },
    {
      surface: "a static embedded question",
      route: "embed/question/:token",
      path: `embed/question/${TOKEN}`,
      setupSurface: () => {
        jest.spyOn(embeddingConfig, "isStaticEmbedding").mockReturnValue(true);
        setupEmbedQuestionEndpoints(TOKEN, EMBED_CARD, DATASET);
      },
    },
  ])(
    "does not show or request the events on $surface",
    async ({ route, path, setupSurface }) => {
      setupSurface();

      renderWithProviders(
        <Route path={route} element={<PublicOrEmbeddedQuestion />} />,
        {
          storeInitialState: createMockState(),
          withRouter: true,
          initialRoute: path,
        },
      );

      // the chart redraws its axis labels and detaches the found node, so only wait for it
      await screen.findByText("Created At: Month");
      await act(async () => {
        await fetchMock.callHistory.flush();
      });

      expect(
        screen.queryByTestId("timeline-event-chip"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Events" }),
      ).not.toBeInTheDocument();
      expect(queryIcon("calendar")).not.toBeInTheDocument();
      expect(getTimelineRequests()).toEqual([]);
    },
  );

  // the fixture can show the event: only the public surface keeps it off the chart
  it("shows the saved events of the same question when the surface allows loading them", async () => {
    setupPublicQuestionEndpoints(UUID, PUBLIC_CARD);
    setupPublicCardQueryEndpoints(UUID, DATASET);

    renderWithProviders(
      <Route
        path="public/question/:uuid"
        element={<PublicOrEmbeddedQuestion />}
      />,
      {
        storeInitialState: createMockState(),
        withRouter: true,
        initialRoute: `public/question/${UUID}`,
      },
    );

    expect(
      await screen.findByRole("button", { name: "RC1" }),
    ).toBeInTheDocument();
    expect(getTimelineRequests()).toHaveLength(1);
  });
});
