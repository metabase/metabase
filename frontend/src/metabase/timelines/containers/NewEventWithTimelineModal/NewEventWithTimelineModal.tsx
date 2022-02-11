import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";
import { createTimelineWithEvent } from "../../actions";
import { ModalProps } from "../../types";

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onSubmit: createTimelineWithEvent,
  onCancel: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
