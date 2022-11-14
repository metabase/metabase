import { connect } from "react-redux";
import { State } from "metabase-types/store";
import { getSetting } from "metabase/selectors/settings";
import GoogleSettingsForm from "../../components/GoogleSettingsForm";
import { updateGoogleSettings } from "../../settings";

const mapStateToProps = (state: State) => ({
  isEnabled: getSetting(state, "google-auth-enabled"),
});

const mapDispatchToProps = {
  onSubmit: updateGoogleSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(GoogleSettingsForm);
