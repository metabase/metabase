import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import Setup from "../../components/Setup";
import {
  setStep,
  setLocale,
  setUser,
  validatePassword,
  setDatabase,
} from "../../actions";
import { getStep, getLocale, getUser, getDatabase } from "../../selectors";

const mapStateToProps = (state: any) => ({
  step: getStep(state),
  locale: getLocale(state),
  localeData: Settings.get("available-locales"),
  user: getUser(state),
  database: getDatabase(state),
});

const mapDispatchToProps = {
  onChangeStep: setStep,
  onChangeLocale: setLocale,
  onChangeUser: setUser,
  onValidatePassword: validatePassword,
  onChangeDatabase: setDatabase,
};

export default connect(mapStateToProps, mapDispatchToProps)(Setup);
