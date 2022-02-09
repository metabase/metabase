import { connect } from "react-redux";
import _ from "underscore";
import { goBack } from "react-router-redux";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Events from "metabase/entities/events";
import NewEventModal from "../../components/NewEventModal";
import { ModalProps } from "../../types";

const collectionProps = {
  id: (props: ModalProps) => Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onSubmit: Events.actions.create,
  onCancel: goBack,
};

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
