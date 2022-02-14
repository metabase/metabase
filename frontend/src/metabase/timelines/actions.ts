import { push } from "react-router-redux";
import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";

export const CREATE_TIMELINE = "metabase/timelines/CREATE_TIMELINE";
export const createTimeline = createThunkAction(
  CREATE_TIMELINE,
  (values: Partial<Timeline>, collection: Collection) => {
    return async (dispatch: Dispatch) => {
      const action = Timelines.actions.create(values);
      const response = await dispatch(action);
      const timeline = Timelines.HACK_getObjectFromAction(response);
      dispatch(push(Urls.timelineInCollection(timeline, collection)));
    };
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
    dispatch(push(Urls.timelineInCollection(timeline, collection)));
  },
);

export const CREATE_EVENT = "metabase/timelines/CREATE_EVENT";
export const createEvent = createThunkAction(
  CREATE_EVENT,
  (
    values: Partial<TimelineEvent>,
    collection: Collection,
    timeline: Timeline,
  ) => async (dispatch: Dispatch) => {
    const action = TimelineEvents.actions.create(values);
    await dispatch(action);
    dispatch(push(Urls.timelineInCollection(timeline, collection)));
  },
);

type Dispatch = any;
