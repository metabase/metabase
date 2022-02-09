import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import EventTimelines from "metabase/entities/event-timelines";
import TimelineModal from "../../components/TimelineModal";
import { ModalProps } from "../../types";

const collectionProps = {
  id: (props: ModalProps) => Urls.extractCollectionId(props.params.slug),
};

const timelineProps = {
  id: (props: ModalProps) => Urls.extractEntityId(props.params.timelineId),
};

export default _.compose(
  Collections.load(collectionProps),
  EventTimelines.load(timelineProps),
)(TimelineModal);
