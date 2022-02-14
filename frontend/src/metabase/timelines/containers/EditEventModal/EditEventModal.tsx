import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { State } from "metabase-types/store";
import EditEventModal from "../../components/EditEventModal";
import { updateEvent } from "../../actions";
import { ModalProps } from "../../types";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
};

const timelineEventProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onSubmit: updateEvent,
  onCancel: goBack,
};

export default _.compose(
  Timelines.load(timelineProps),
  TimelineEvents.load(timelineEventProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(EditEventModal);
