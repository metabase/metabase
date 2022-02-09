import { connect } from "react-redux";
import _ from "underscore";
import { goBack } from "react-router-redux";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import NewTimelineModal from "../../components/NewTimelineModal";
import { State } from "metabase-types/store";
import { createTimeline } from "../../actions";

export interface NewTimelineModalParams {
  slug: string;
}

export interface NewTimelineModalProps {
  params: NewTimelineModalParams;
}

const collectionProps = {
  id: (state: State, props: NewTimelineModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onSubmit: createTimeline,
  onClose: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewTimelineModal);
