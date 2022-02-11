import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import { State } from "metabase-types/store";
import NewTimelineModal from "../../components/NewTimelineModal";
import { createTimeline } from "../../actions";
import { ModalProps } from "../../types";

const collectionProps = {
  query: (state: State, props: ModalProps) => ({
    id: Urls.extractCollectionId(props.params.slug),
  }),
};

const mapDispatchToProps = {
  onSubmit: createTimeline,
  onCancel: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewTimelineModal);
