import { screen, waitFor } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { getFetchedTimelines, getVisibleTimelineEventIds } from "../selectors";

import { TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD, setup } from "./test-utils";

registerVisualizations();

const EVENT_ID = 99;

const CARD = TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD;

const TIMELINE = createMockTimeline({
  id: 1,
  // Match the question's collection so showTimelinesForCollection selects it.
  collection_id: CARD.collection_id,
  events: [
    createMockTimelineEvent({
      id: EVENT_ID,
      name: "RC1",
      timestamp: "2025-06-01T00:00:00Z",
    }),
  ],
});

describe("QueryBuilder > timeline events (GHY-3839)", () => {
  it("shows timeline events when the timelines request resolves after the question loads", async () => {
    // Delay /api/timeline so it resolves *after* the question and bookmarks have
    // loaded — i.e. after the effect that calls showTimelinesForCollection has
    // already run once without them. This reproduces the load-order race: if the
    // effect doesn't re-run when the timelines arrive, the event is never added
    // to the visible set and no marker ever renders on the chart.
    const { store } = await setup({
      card: CARD,
      timelines: [TIMELINE],
      timelinesDelay: 200,
    });

    // Guard the race conditions: the timelines must not have loaded yet, so the
    // effect's first run already happened without them. If this fails, bump the
    // delay — otherwise the test wouldn't actually exercise the re-run.
    expect(getFetchedTimelines(store.getState())).toHaveLength(0);
    expect(getVisibleTimelineEventIds(store.getState())).toHaveLength(0);

    // The timelines request resolves.
    await waitFor(() => {
      expect(getFetchedTimelines(store.getState())).toHaveLength(1);
    });

    // Once loaded, the event must become visible on the chart. Without the fix
    // the effect never re-runs and this stays empty — that's the bug. The DOM
    // query forces React to flush the re-render triggered by the late resolve.
    await waitFor(
      () => {
        // Reading the DOM forces testing-library to flush React's pending
        // re-render from the late timelines resolve (queryByTestId, so it
        // doesn't throw if the chart subtree errored out under jsdom).
        screen.queryByTestId("test-container");
        expect(getVisibleTimelineEventIds(store.getState())).toContain(
          EVENT_ID,
        );
      },
      { timeout: 5000 },
    );
  });
});
