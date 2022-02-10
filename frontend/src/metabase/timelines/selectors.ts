import * as Urls from "metabase/lib/urls";
import { State, TimelineMode } from "metabase-types/store";
import { ModalProps } from "./types";

export const getMode = (state: State): TimelineMode => {
  return state.timelines.mode;
};

export const getTimelineId = (state: State): number | undefined => {
  return state.timelines.timelineId;
};

export const getTimelineEventId = (state: State): number | undefined => {
  return state.timelines.timelineEventId;
};

export const getCollectionId = (state: State, props: ModalProps) => {
  return Urls.extractCollectionId(props.params.slug);
};

export const getTimelineQuery = (state: State) => {
  return { id: getTimelineId(state) };
};
