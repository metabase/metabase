import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import LanguageStep from "../../components/LanguageStep";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import {
  getLocale,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
} from "../../selectors";
import { Locale } from "../../types";
import { setLocale, setStep } from "../../actions";

const mapStateToProps = (state: any) => ({
  locale: getLocale(state),
  localeData: Settings.get("available-locales"),
  isStepActive: isStepActive(state, LANGUAGE_STEP),
  isStepCompleted: isStepCompleted(state, LANGUAGE_STEP),
  isSetupCompleted: isSetupCompleted(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onChangeLocale: (locale: Locale) => dispatch(setLocale(locale)),
  onSelectThisStep: () => dispatch(setStep(LANGUAGE_STEP)),
  onSelectNextStep: () => dispatch(setStep(USER_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(LanguageStep);
