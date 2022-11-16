import { connect } from "react-redux";
import { State } from "metabase-types/store";
import GoogleAuthForm from "../../components/GoogleAuthForm";
import { updateGoogleSettings } from "../../../settings";

const mapStateToProps = (state: State) => ({
  isSsoEnabled: state.settings.values["token-features"].sso,
});

const mapDispatchToProps = {
  onSubmit: updateGoogleSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(GoogleAuthForm);
