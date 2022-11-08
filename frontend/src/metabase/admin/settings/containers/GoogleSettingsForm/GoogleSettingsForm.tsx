import { connect } from "react-redux";
import { updateGoogleSettings } from "../../settings";
import GoogleSettingsForm from "../../components/GoogleSettingsForm";

const mapDispatchToProps = {
  onSubmit: updateGoogleSettings,
};

export default connect(null, mapDispatchToProps)(GoogleSettingsForm);
