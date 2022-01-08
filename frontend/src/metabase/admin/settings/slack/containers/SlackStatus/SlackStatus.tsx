import { connect } from "react-redux";
import SlackStatus from "../../components/SlackStatus";
import SlackStatusForm from "../../containers/SlackStatusForm";
import { updateSettings } from "../../actions";

const mapStateToProps = () => ({
  Form: SlackStatusForm,
  hasTokenError: false,
});

const mapDispatchToProps = {
  onDelete: updateSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(SlackStatus);
