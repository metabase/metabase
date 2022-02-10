import { connect } from "react-redux";
import _ from "underscore";
import { goBack } from "react-router-redux";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";
import { createEvent } from "../../actions";

export interface NewEventModalParams {
  slug: string;
  timelineId: string;
}

export interface NewEventModalProps {
  params: NewEventModalParams;
}

const collectionProps = {
  id: (state: State, props: NewEventModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const timelineProps = {
  id: (state: State, props: NewEventModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
};

const mapDispatchToProps = {
  onSubmit: createEvent,
  onClose: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
