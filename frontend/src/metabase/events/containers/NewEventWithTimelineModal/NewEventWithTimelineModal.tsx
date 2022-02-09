import { connect } from "react-redux";
import _ from "underscore";
import { goBack } from "react-router-redux";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";
import { createEventWithTimeline } from "../../actions";

export interface NewEventWithTimelineModalParams {
  slug: string;
}

export interface NewEventWithTimelineModalProps {
  params: NewEventWithTimelineModalParams;
}

const collectionProps = {
  id: (state: State, props: NewEventWithTimelineModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onSubmit: createEventWithTimeline,
  onCancel: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
