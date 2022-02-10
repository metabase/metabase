import { push } from "react-router-redux";
import { getDefaultTimeline } from "metabase/lib/timeline";
import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import TimelineEvents from "metabase/entities/timeline-events";
import Timelines from "metabase/entities/timelines";
import { Collection, TimelineEvent, Timeline } from "metabase-types/api";

export const CREATE_EVENT = "metabase/events/CREATE_EVENT";
export const createEvent = createThunkAction(
  CREATE_EVENT,
  (values: Partial<TimelineEvent>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const event = await createEventEntity(values, dispatch);
    dispatch(push(Urls.timeline(event.timeline_id, collection)));
  },
);

export const CREATE_TIMELINE = "metabase/events/CREATE_TIMELINE";
export const createTimeline = createThunkAction(
  CREATE_TIMELINE,
  (values: Partial<Timeline>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const timeline = await createTimelineEntity(values, dispatch);
    dispatch(push(Urls.timeline(timeline.id, collection)));
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
    dispatch(push(Urls.timeline(timeline.id, collection)));
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
