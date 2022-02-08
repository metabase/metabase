import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import NewEventTimelineModal from "../../components/NewEventTimelineModal";

const mapDispatchToProps = {
  onClose: goBack,
};

export default connect(null, mapDispatchToProps)(NewEventTimelineModal);
