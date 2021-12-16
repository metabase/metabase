import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import Setup from "../../components/Setup";
import {
  setStep,
  setLocale,
  setUser,
  validatePassword,
  setDatabase,
  setTracking,
  validateDatabase,
  submitSetup,
} from "../../actions";
import {
  getStep,
  getLocale,
  getUser,
  getDatabase,
  isTrackingAllowed,
} from "../../selectors";

const mapStateToProps = (state: any) => ({
  step: getStep(state),
  locale: getLocale(state),
  localeData: Settings.get("available-locales"),
  user: getUser(state),
  database: getDatabase(state),
  isTrackingAllowed: isTrackingAllowed(state),
});

const mapDispatchToProps = {
  onChangeStep: setStep,
  onChangeLocale: setLocale,
  onChangeUser: setUser,
  onChangeDatabase: setDatabase,
  onChangeTracking: setTracking,
  onValidatePassword: validatePassword,
  onValidateDatabase: validateDatabase,
  onSubmitSetup: submitSetup,
};

export default connect(mapStateToProps, mapDispatchToProps)(Setup);
