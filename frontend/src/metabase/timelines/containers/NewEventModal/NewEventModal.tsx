import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";
import { createEvent } from "../../actions";
import { ModalProps } from "../../types";

const timelineProps = {
  query: (state: State, props: ModalProps) => ({
    id: Urls.extractEntityId(props.params.timelineId),
  }),
};

const collectionProps = {
  query: (state: State, props: ModalProps) => ({
    id: Urls.extractCollectionId(props.params.slug),
  }),
};

const mapDispatchToProps = {
  onSubmit: createEvent,
  onCancel: goBack,
};

export default _.compose(
  Timelines.load(timelineProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
