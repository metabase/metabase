import { handleActions } from "redux-actions";
import { CREATE_EVENT_WITH_TIMELINE, CREATE_TIMELINE } from "./actions";
import { Timeline } from "metabase-types/api";
import { TimelineMode } from "metabase-types/store";

export const mode = handleActions<TimelineMode, Timeline>(
  {
    [CREATE_TIMELINE]: { next: () => "timeline-view" },
    [CREATE_EVENT_WITH_TIMELINE]: { next: () => "timeline-view" },
  },
  "timeline-list",
);

export const timelineId = handleActions<number | null, Timeline>(
  {
    [CREATE_TIMELINE]: { next: (state, { payload }) => payload.id },
    [CREATE_EVENT_WITH_TIMELINE]: { next: (state, { payload }) => payload.id },
  },
  null,
);

export default {
  mode,
};
