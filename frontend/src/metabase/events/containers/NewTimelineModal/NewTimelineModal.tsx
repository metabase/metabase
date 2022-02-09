import { connect } from "react-redux";
import NewTimelineModal from "../../components/NewTimelineModal";

const mapDispatchToProps = {
  onSubmit: console.log,
  onCancel: console.log,
};

export default connect(null, mapDispatchToProps)(NewTimelineModal);
