import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";

export const SET_MODE = "metabase/timelines/SET_MODE";
export const setMode = createAction(SET_MODE);

export const SET_TIMELINE = "metabase/timelines/SET_TIMELINE";
export const setTimeline = createAction(SET_TIMELINE);

export const SET_EVENT = "metabase/timelines/SET_EVENT";
export const setEvent = createAction(SET_EVENT);

export const CREATE_TIMELINE = "metabase/timelines/CREATE_TIMELINE";
export const createTimeline = createThunkAction(
  CREATE_TIMELINE,
  (values: Partial<Timeline>) => async (dispatch: Dispatch) => {
    const action = Timelines.actions.create(values);
    const response = await dispatch(action);
    const timeline = Timelines.HACK_getObjectFromAction(response);
    dispatch(setMode("timeline-view"));
    dispatch(setTimeline(timeline.id));
  },
);

export const CREATE_TIMELINE_WITH_EVENT =
  "metabase/timelines/CREATE_TIMELINE_WITH_EVENT";
export const createTimelineWithEvent = createThunkAction(
  CREATE_TIMELINE_WITH_EVENT,
  (values: Partial<TimelineEvent>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const action = Timelines.actions.createWithEvent(values, collection);
    const response = await dispatch(action);
    const timeline = Timelines.HACK_getObjectFromAction(response);
    dispatch(setMode("timeline-view"));
    dispatch(setTimeline(timeline.id));
  },
);

export const CREATE_EVENT = "metabase/timelines/CREATE_EVENT";
export const createEvent = createThunkAction(
  CREATE_EVENT,
  (values: Partial<TimelineEvent>) => async (dispatch: Dispatch) => {
    const action = TimelineEvents.actions.create(values);
    const response = await dispatch(action);
    const event = TimelineEvents.HACK_getObjectFromAction(response);
    dispatch(setMode("timeline-view"));
    dispatch(setTimeline(event.id));
  },
);

type Dispatch = any;
