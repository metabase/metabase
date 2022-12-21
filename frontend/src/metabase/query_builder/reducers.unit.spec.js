import TimelineEvents from "metabase/entities/timeline-events";

import { visibleTimelineEventIds } from "./reducers";

import {
  INITIALIZE_QB,
  RESET_QB,
  SHOW_TIMELINE_EVENTS,
  HIDE_TIMELINE_EVENTS,
} from "./actions";

describe("timeline event reducers", () => {
  it("should initialize with an empty array", () => {
    expect(
      visibleTimelineEventIds([], {
        type: INITIALIZE_QB,
      }),
    ).toEqual([]);
  });

  it("should become an empty array on reset QB", () => {
    expect(
      visibleTimelineEventIds([], {
        type: RESET_QB,
      }),
    ).toEqual([]);
  });

  it("should add event ids on show", () => {
    expect(
      visibleTimelineEventIds([], {
        type: SHOW_TIMELINE_EVENTS,
        payload: [{ id: 0 }, { id: 1 }, { id: 2 }],
      }),
    ).toEqual([0, 1, 2]);
  });

  it("should remove event ids on hide", () => {
    expect(
      visibleTimelineEventIds([0, 1, 2, 3, 4, 5, 6], {
        type: HIDE_TIMELINE_EVENTS,
        payload: [{ id: 0 }, { id: 2 }, { id: 4 }, { id: 6 }],
      }),
    ).toEqual([1, 3, 5]);
  });

  it("should add event id on create", () => {
    expect(
      visibleTimelineEventIds([0, 1], {
        type: TimelineEvents.actionTypes.CREATE,
        payload: { timelineEvent: { id: 2 } },
      }),
    ).toEqual([0, 1, 2]);
  });
});
