import * as Urls from "metabase/lib/urls";
import { State } from "metabase-types/store";
import { ModalProps } from "./types";

export const getTimelineId = (
  state: State,
  props: ModalProps,
): number | undefined => {
  return Urls.extractEntityId(props.params.timelineId);
};

export const getCollectionId = (state: State, props: ModalProps) => {
  return Urls.extractCollectionId(props.params.slug);
};

export const getTimelineQuery = (state: State, props: ModalProps) => {
  return { collectionId: getCollectionId(state, props) };
};
