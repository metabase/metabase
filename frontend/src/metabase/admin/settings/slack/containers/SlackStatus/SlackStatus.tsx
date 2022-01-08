import { connect } from "react-redux";
import SlackStatus from "../../components/SlackStatus";
import SlackStatusForm from "../../containers/SlackStatusForm";
import { updateSettings } from "../../actions";

const mapStateToProps = () => ({
  StatusForm: SlackStatusForm,
  hasSlackError: false,
});

const mapDispatchToProps = {
  onDelete: updateSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(SlackStatus);
