import fetchMock from "fetch-mock";

import { setupTimelinesEndpoints } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import * as embeddingConfig from "metabase/embedding/config";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { useTimelineEvents } from "./use-timeline-events";

const SHOWN_EVENT = createMockTimelineEvent({ id: 1, timeline_id: 10 });
const HIDDEN_EVENT = createMockTimelineEvent({ id: 2, timeline_id: 10 });
const TIMELINE = createMockTimeline({
  id: 10,
  events: [SHOWN_EVENT, HIDDEN_EVENT],
});

const SETTINGS: VisualizationProps["settings"] = {
  "timeline.selected_timeline_ids": [TIMELINE.id],
  "timeline.excluded_timeline_event_ids": [HIDDEN_EVENT.id],
};

const setup = (timelineEvents?: TimelineEvent[]) => {
  setupTimelinesEndpoints([TIMELINE]);
  return renderHookWithProviders(
    () => useTimelineEvents({ timelineEvents, settings: SETTINGS }),
    {},
  );
};

const getTimelineRequests = () =>
  fetchMock.callHistory.calls("path:/api/timeline");

describe("useTimelineEvents", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads the events a question was saved with", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    });
    expect(getTimelineRequests()).toHaveLength(1);
  });

  it("uses the events it is given instead of loading them", () => {
    const { result } = setup([SHOWN_EVENT]);

    expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    expect(getTimelineRequests()).toHaveLength(0);
  });

  it.each([
    [
      "public links",
      () =>
        jest.spyOn(embeddingConfig, "isPublicEmbedding").mockReturnValue(true),
    ],
    [
      "static embeds",
      () =>
        jest.spyOn(embeddingConfig, "isStaticEmbedding").mockReturnValue(true),
    ],
    ["the embedding SDK", () => mockIsEmbeddingSdk()],
  ])("does not load events on %s", async (_surface, mockSurface) => {
    await mockSurface();

    const { result } = setup();

    expect(result.current.timelineEvents).toEqual([]);
    expect(getTimelineRequests()).toHaveLength(0);
  });
});
