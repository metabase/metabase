import { connect } from "react-redux";
import SlackSetupForm from "../../components/SlackSetupForm";
import { updateSettings } from "../../actions";

const mapDispatchToProps = {
  onSubmit: updateSettings,
};

export default connect(null, mapDispatchToProps)(SlackSetupForm);
