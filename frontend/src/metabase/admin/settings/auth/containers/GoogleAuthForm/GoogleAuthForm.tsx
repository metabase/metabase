import { connect } from "react-redux";

import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import { updateGoogleSettings } from "../../../settings";
import GoogleAuthForm from "../../components/GoogleAuthForm";

const mapStateToProps = (state: State) => ({
  isEnabled: getSetting(state, "google-auth-enabled"),
  isSsoEnabled: getSetting(state, "token-features").sso_google,
});

const mapDispatchToProps = {
  onSubmit: updateGoogleSettings,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(GoogleAuthForm);
