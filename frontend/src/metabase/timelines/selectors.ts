import * as Urls from "metabase/lib/urls";
import { State, TimelineMode } from "metabase-types/store";
import { ModalProps } from "./types";

export const getMode = (state: State): TimelineMode => {
  return state.timeline.mode;
};

export const getTimelineId = (state: State): number | undefined => {
  return state.timeline.timelineId;
};

export const getTimelineEventId = (state: State): number | undefined => {
  return state.timeline.timelineEventId;
};

export const getCollectionId = (state: State, props: ModalProps) => {
  return Urls.extractCollectionId(props.params.slug);
};

export const getTimelineQuery = (state: State) => {
  return { id: getTimelineId(state) };
};
