import { connect } from "react-redux";
import { State } from "metabase-types/store";
import { getSetting } from "metabase/selectors/settings";
import GoogleSettingsForm from "../../components/GoogleSettingsForm";
import { updateGoogleSettings } from "../../settings";
import { getSettings, getSettingValues } from "../../selectors";

const mapStateToProps = (state: State) => ({
  settings: getSettings(state),
  settingValues: getSettingValues(state),
  isEnabled: getSetting(state, "google-auth-enabled"),
});

const mapDispatchToProps = {
  onSubmit: updateGoogleSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(GoogleSettingsForm);
