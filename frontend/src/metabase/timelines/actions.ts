import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { getDefaultTimeline } from "metabase/lib/timeline";

export const SET_MODE = "metabase/timelines/SET_MODE";
export const setMode = createAction(SET_MODE);

export const SET_TIMELINE = "metabase/timelines/SET_TIMELINE";
export const setTimeline = createAction(SET_TIMELINE);

export const SET_EVENT = "metabase/timelines/SET_EVENT";
export const setEvent = createAction(SET_EVENT);

export const CREATE_EVENT = "metabase/timelines/CREATE_EVENT";
export const createEvent = createThunkAction(
  CREATE_EVENT,
  (values: Partial<TimelineEvent>) => async (dispatch: Dispatch) => {
    const event = await createEventEntity(values, dispatch);
    dispatch(setMode("timeline-view"));
    dispatch(setTimeline(event.id));
  },
);

export const CREATE_EVENT_WITH_TIMELINE =
  "metabase/timelines/CREATE_EVENT_WITH_TIMELINE";
export const createEventWithTimeline = createThunkAction(
  CREATE_EVENT_WITH_TIMELINE,
  (values: Partial<TimelineEvent>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const timeline = await createEventWithTimelineEntity(
      values,
      collection,
      dispatch,
    );
    dispatch(setMode("timeline-view"));
    dispatch(setTimeline(timeline.id));
  },
);

export const CREATE_TIMELINE = "metabase/timelines/CREATE_TIMELINE";
export const createTimeline = createThunkAction(
  CREATE_TIMELINE,
  (values: Partial<Timeline>) => async (dispatch: Dispatch) => {
    const timeline = await createTimelineEntity(values, dispatch);
    dispatch(setMode("timeline-view"));
    dispatch(setTimeline(timeline.id));
  },
);

const createEventEntity = async (
  values: Partial<TimelineEvent>,
  dispatch: Dispatch,
): Promise<TimelineEvent> => {
  const action = await dispatch(TimelineEvents.actions.create(values));
  return TimelineEvents.HACK_getObjectFromAction(action);
};

const createEventWithTimelineEntity = async (
  values: Partial<TimelineEvent>,
  collection: Collection,
  dispatch: Dispatch,
): Promise<Timeline> => {
  const timelineValues = getDefaultTimeline(collection);
  const timeline = await createTimelineEntity(timelineValues, dispatch);
  const eventValues = { ...values, timeline_id: timeline.id };
  await createEventEntity(eventValues, dispatch);
  return timeline;
};

const createTimelineEntity = async (
  values: Partial<Timeline>,
  dispatch: Dispatch,
): Promise<Timeline> => {
  const action = await dispatch(Timelines.actions.create(values));
  return Timelines.HACK_getObjectFromAction(action);
};

type Dispatch = any;
