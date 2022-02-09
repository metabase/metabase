import { connect } from "react-redux";
import _ from "underscore";
import { goBack } from "react-router-redux";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import NewTimelineModal from "../../components/NewTimelineModal";
import { createTimeline } from "../../actions";
import { ModalProps } from "../../types";

const collectionProps = {
  id: (props: ModalProps) => Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onSubmit: createTimeline,
  onCancel: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewTimelineModal);
