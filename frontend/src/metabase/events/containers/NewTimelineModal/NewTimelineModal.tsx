import { connect } from "react-redux";
import NewTimelineModal from "../../components/NewTimelineModal";

const mapDispatchToProps = {
  onSaved: console.log,
  onClose: console.log,
};

export default connect(null, mapDispatchToProps)(NewTimelineModal);
