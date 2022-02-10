import { createThunkAction } from "metabase/lib/redux";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { getDefaultTimeline } from "metabase/lib/timeline";

export const CREATE_EVENT = "metabase/events/CREATE_EVENT";
export const createEvent = createThunkAction(
  CREATE_EVENT,
  (values: Partial<TimelineEvent>) => async (dispatch: Dispatch) => {
    return await createEventEntity(values, dispatch);
  },
);

export const CREATE_TIMELINE = "metabase/events/CREATE_TIMELINE";
export const createTimeline = createThunkAction(
  CREATE_TIMELINE,
  (values: Partial<Timeline>) => async (dispatch: Dispatch) => {
    return await createTimelineEntity(values, dispatch);
  },
);

export const CREATE_EVENT_WITH_TIMELINE =
  "metabase/events/CREATE_EVENT_WITH_TIMELINE";
export const createEventWithTimeline = createThunkAction(
  CREATE_EVENT_WITH_TIMELINE,
  (values: Partial<TimelineEvent>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const timelineValues = getDefaultTimeline(collection);
    const timeline = await createTimelineEntity(timelineValues, dispatch);
    const eventValues = { ...values, timeline_id: timeline.id };
    await createEventEntity(eventValues, dispatch);
    return timeline;
  },
);

const createEventEntity = async (
  values: Partial<TimelineEvent>,
  dispatch: Dispatch,
): Promise<TimelineEvent> => {
  const action = await dispatch(TimelineEvents.actions.create(values));
  return TimelineEvents.HACK_getObjectFromAction(action);
};

const createTimelineEntity = async (
  values: Partial<Timeline>,
  dispatch: Dispatch,
): Promise<Timeline> => {
  const action = await dispatch(Timelines.actions.create(values));
  return Timelines.HACK_getObjectFromAction(action);
};

type Dispatch = any;
