import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import LanguageStep from "../../components/LanguageStep";
import { setLocale, setStep } from "../../actions";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import {
  getLocale,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
} from "../../selectors";
import { Locale } from "../../types";

const mapStateToProps = (state: any) => ({
  locale: getLocale(state),
  localeData: Settings.get("available-locales"),
  isStepActive: isStepActive(state, LANGUAGE_STEP),
  isStepCompleted: isStepCompleted(state, LANGUAGE_STEP),
  isSetupCompleted: isSetupCompleted(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onLocaleChange: (locale: Locale) => {
    dispatch(setLocale(locale));
    Settings.set("user-locale", locale.code);
  },
  onStepSelect: () => {
    dispatch(setStep(LANGUAGE_STEP));
  },
  onStepSubmit: () => {
    dispatch(setStep(USER_STEP));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(LanguageStep);
