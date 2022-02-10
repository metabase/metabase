import { handleActions } from "redux-actions";
import { SET_EVENT, SET_MODE, SET_TIMELINE } from "./actions";
import { TimelineMode } from "metabase-types/store";

export const mode = handleActions<TimelineMode>(
  {
    [SET_MODE]: { next: (state, { payload }) => payload },
  },
  "timeline-list",
);

export const timelineId = handleActions<number | null>(
  {
    [SET_TIMELINE]: { next: (state, { payload }) => payload },
  },
  null,
);

export const timelineEventId = handleActions<number | null>(
  {
    [SET_EVENT]: { next: (state, { payload }) => payload },
  },
  null,
);

export default {
  mode,
  timelineId,
  timelineEventId,
};
