import { createThunkAction } from "metabase/lib/redux";
import EventTimelines from "metabase/entities/event-timelines";
import { Collection, Event } from "metabase-types/api";
import { getDefaultEvent, getDefaultTimeline } from "metabase/lib/events";
import Events from "metabase/entities/events";

export const CREATE_EVENT_WITH_TIMELINE =
  "metabase/events/CREATE_EVENT_WITH_TIMELINE";
export const createEventWithTimeline = createThunkAction(
  CREATE_EVENT_WITH_TIMELINE,
  (values: Partial<Event>, collection: Collection) => async (dispatch: any) => {
    const action = await dispatch(
      EventTimelines.actions.create(getDefaultTimeline(collection)),
    );
    const timeline = EventTimelines.HACK_getObjectFromAction(action);
    await dispatch(Events.actions.create(getDefaultEvent(values, timeline)));
  },
);
