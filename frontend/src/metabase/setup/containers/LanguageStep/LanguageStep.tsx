import { connect } from "react-redux";
import LanguageStep from "../../components/LanguageStep";
import { setLocale, setStep } from "../../actions";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import { Locale } from "../../types";
import {
  getLocales,
  getLocale,
  isStepActive,
  isStepCompleted,
} from "../../selectors";

const mapStateToProps = (state: any) => ({
  locales: getLocales(state),
  selectedLocale: getLocale(state),
  isActive: isStepActive(state, LANGUAGE_STEP),
  isCompleted: isStepCompleted(state, LANGUAGE_STEP),
});

const mapDispatchToProps = (dispatch: any) => ({
  onChangeLocale: (locale: Locale) => dispatch(setLocale(locale)),
  onSelectThisStep: () => dispatch(setStep(LANGUAGE_STEP)),
  onSelectNextStep: () => dispatch(setStep(USER_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(LanguageStep);
