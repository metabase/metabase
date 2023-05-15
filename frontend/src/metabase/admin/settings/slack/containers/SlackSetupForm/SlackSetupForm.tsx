import { connect } from "react-redux";
import SlackSetupForm from "../../components/SlackSetupForm";
import { updateSettings } from "../../actions";

const mapDispatchToProps = {
  onSubmit: updateSettings,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(SlackSetupForm);
