import { connect } from "react-redux";

import { updateSettings } from "../../actions";
import SlackSetupForm from "../../components/SlackSetupForm";

const mapDispatchToProps = {
  onSubmit: updateSettings,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(SlackSetupForm);
