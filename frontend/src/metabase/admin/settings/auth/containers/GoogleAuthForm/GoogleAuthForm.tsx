import { connect } from "react-redux";

import { getSetting } from "metabase/selectors/settings";

import type { State } from "metabase-types/store";

import GoogleAuthForm from "../../components/GoogleAuthForm";
import { updateGoogleSettings } from "../../../settings";

const mapStateToProps = (state: State) => ({
  isEnabled: getSetting(state, "google-auth-enabled"),
  isSsoEnabled: getSetting(state, "token-features").sso,
});

const mapDispatchToProps = {
  onSubmit: updateGoogleSettings,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(GoogleAuthForm);
