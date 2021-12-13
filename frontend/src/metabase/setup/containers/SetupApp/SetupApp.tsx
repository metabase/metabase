import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import Setup from "../../components/Setup";
import { setStep, setLocale, setUser, validatePassword } from "../../actions";
import { getStep, getLocale, getUser } from "../../selectors";

const mapStateToProps = (state: any) => ({
  step: getStep(state),
  locale: getLocale(state),
  localeData: Settings.get("available-locales"),
  user: getUser(state),
});

const mapDispatchToProps = {
  onChangeStep: setStep,
  onChangeLocale: setLocale,
  onChangeUser: setUser,
  onValidatePassword: validatePassword,
};

export default connect(mapStateToProps, mapDispatchToProps)(Setup);
