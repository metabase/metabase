import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";
import TimelineListModal from "../../components/TimelineListModal";

export interface TimelineListModalProps {
  collectionId: CollectionId;
}

const timelineProps = {
  query: (state: State, props: TimelineListModalProps) => ({
    collectionId: props.collectionId,
  }),
};

const collectionProps = {
  id: (state: State, props: TimelineListModalProps) => props.collectionId,
};

export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
)(TimelineListModal);
