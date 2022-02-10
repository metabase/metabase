import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";

export interface NewEventModalProps {
  timelineId: string;
  collectionId: CollectionId;
}

const timelineProps = {
  id: (state: State, props: NewEventModalProps) => props.timelineId,
};

const collectionProps = {
  id: (state: State, props: NewEventModalProps) => props.collectionId,
};

export default _.compose(
  Timelines.load(timelineProps),
  Collections.load(collectionProps),
)(NewEventModal);
