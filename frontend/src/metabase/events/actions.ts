import { push } from "react-router-redux";
import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import Events from "metabase/entities/events";
import EventTimelines from "metabase/entities/event-timelines";
import { Collection, Event, EventTimeline } from "metabase-types/api";
import { getDefaultTimeline } from "metabase/lib/events";

type Dispatch = any;

export const CREATE_EVENT = "metabase/events/CREATE_EVENT";
export const createEvent = createThunkAction(
  CREATE_EVENT,
  (values: Partial<Event>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const event = await createEventEntity(values, dispatch);
    dispatch(push(Urls.timeline(collection, event.timeline_id)));
  },
);

export const CREATE_TIMELINE = "metabase/events/CREATE_TIMELINE";
export const createTimeline = createThunkAction(
  CREATE_TIMELINE,
  (values: Partial<EventTimeline>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const timeline = await createTimelineEntity(values, dispatch);
    dispatch(push(Urls.timeline(collection, timeline.id)));
  },
);

export const CREATE_EVENT_WITH_TIMELINE =
  "metabase/events/CREATE_EVENT_WITH_TIMELINE";
export const createEventWithTimeline = createThunkAction(
  CREATE_EVENT_WITH_TIMELINE,
  (values: Partial<Event>, collection: Collection) => async (
    dispatch: Dispatch,
  ) => {
    const timelineValues = getDefaultTimeline(collection);
    const timeline = await createTimelineEntity(timelineValues, dispatch);
    const eventValues = { ...values, timeline_id: timeline.id };
    await createEventEntity(eventValues, dispatch);
    dispatch(push(Urls.timeline(collection, timeline.id)));
  },
);

const createEventEntity = async (
  values: Partial<Event>,
  dispatch: Dispatch,
): Promise<Event> => {
  const action = await dispatch(Events.actions.create(values));
  return Events.HACK_getObjectFromAction(action);
};

const createTimelineEntity = async (
  values: Partial<EventTimeline>,
  dispatch: Dispatch,
): Promise<EventTimeline> => {
  const action = await dispatch(EventTimelines.actions.create(values));
  return EventTimelines.HACK_getObjectFromAction(action);
};
