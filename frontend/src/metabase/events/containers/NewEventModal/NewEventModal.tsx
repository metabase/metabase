import { connect } from "react-redux";
import _ from "underscore";
import { goBack } from "react-router-redux";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import EventTimelines from "metabase/entities/event-timelines";
import NewEventModal from "../../components/NewEventModal";
import { createEvent } from "../../actions";

interface ModalParams {
  slug: string;
  timelineId: string;
}

interface ModalProps {
  params: ModalParams;
}

const collectionProps = {
  id: (props: ModalProps) => Urls.extractCollectionId(props.params.slug),
};

const timelineProps = {
  id: (props: ModalProps) => Urls.extractEntityId(props.params.timelineId),
};

const mapDispatchToProps = {
  onSubmit: createEvent,
  onCancel: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  EventTimelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
