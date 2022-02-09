import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import Events from "metabase/entities/events";
import NewEventModal from "../../components/NewEventModal";

const mapDispatchToProps = {
  onSubmit: Events.actions.create,
  onCancel: goBack,
};

export default connect(null, mapDispatchToProps)(NewEventModal);
