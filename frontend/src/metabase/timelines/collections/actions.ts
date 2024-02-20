import { push } from "react-router-redux";

import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import type { Timeline } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const setCollectionAndNavigate = (
  timeline: Timeline,
  collectionId: number | null,
) => {
  return async (dispatch: any, getState: () => State) => {
    const collection = { id: collectionId };
    await dispatch(Timelines.actions.setCollection(timeline, collection));

    const newProps = { entityId: timeline.id };
    const newTimeline = Timelines.selectors.getObject(getState(), newProps);
    dispatch(push(Urls.timelineInCollection(newTimeline)));
  };
};
