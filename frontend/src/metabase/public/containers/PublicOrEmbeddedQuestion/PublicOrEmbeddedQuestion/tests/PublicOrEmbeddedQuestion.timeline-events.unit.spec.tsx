import fetchMock from "fetch-mock";

import {
  setupPublicCardQueryEndpoints,
  setupPublicQuestionEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockDatetimeColumn,
  createMockEmbedDataset,
  createMockNumericColumn,
  createMockPublicCard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { PublicOrEmbeddedQuestion } from "../PublicOrEmbeddedQuestion";

registerVisualizations();

const UUID = "mock-uuid";
const QUESTION_NAME = "Orders over time";

const TIMELINE = createMockTimeline({
  id: 10,
  events: [
    createMockTimelineEvent({
      id: 101,
      timeline_id: 10,
      name: "RC1",
      timestamp: "2025-06-01T00:00:00",
    }),
  ],
});

async function setup() {
  setupPublicQuestionEndpoints(
    UUID,
    createMockPublicCard({
      name: QUESTION_NAME,
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "timeline.selected_timeline_ids": [TIMELINE.id],
        "timeline.excluded_timeline_event_ids": [],
      },
    }),
  );
  setupPublicCardQueryEndpoints(
    UUID,
    createMockEmbedDataset({
      data: {
        cols: [
          createMockDatetimeColumn({ name: "CREATED_AT", unit: "day" }),
          createMockNumericColumn({ name: "count" }),
        ],
        rows: [
          ["2025-06-01", 1],
          ["2025-06-05", 2],
        ],
      },
    }),
  );
  setupTimelinesEndpoints([TIMELINE]);

  renderWithProviders(
    <Route
      path="public/question/:uuid"
      element={<PublicOrEmbeddedQuestion />}
    />,
    {
      storeInitialState: createMockState({ settings: mockSettings({}) }),
      withRouter: true,
      initialRoute: `public/question/${UUID}`,
    },
  );

  expect(await screen.findByText(QUESTION_NAME)).toBeInTheDocument();
  await waitForLoaderToBeRemoved();
}

describe("PublicOrEmbeddedQuestion > timeline events", () => {
  it("neither shows nor requests the events a shared question was saved with", async () => {
    await setup();

    expect(screen.queryByLabelText("calendar icon")).not.toBeInTheDocument();
    expect(screen.queryByText("RC1")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);
  });
});
