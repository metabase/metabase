import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { Dispatch, State } from "metabase-types/store";
import { updateSetting, deleteGoogleSettings } from "../../../settings";
import AuthCard from "../AuthCard";

const ENABLED_KEY = "google-auth-enabled";
const CONFIGURED_KEY = "google-auth-configured";

const mapStateToProps = (state: State) => ({
  type: "google",
  name: t`Google Sign-in`,
  title: t`Sign in with Google`,
  description: t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`,
  isEnabled: getSetting(state, ENABLED_KEY),
  isConfigured: getSetting(state, CONFIGURED_KEY),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onChange: (value: boolean) =>
    dispatch(updateSetting({ key: ENABLED_KEY, value })),
  onDeactivate: () => dispatch(deleteGoogleSettings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
