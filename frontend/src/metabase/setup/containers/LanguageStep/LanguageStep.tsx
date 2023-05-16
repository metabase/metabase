import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { State, Locale } from "metabase-types/store";
import LanguageStep from "../../components/LanguageStep";
import { setLocale, setStep } from "../../actions";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import {
  getLocale,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  isLocaleLoaded,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  locale: getLocale(state),
  localeData: Settings.get("available-locales") || [],
  isStepActive: isStepActive(state, LANGUAGE_STEP),
  isStepCompleted: isStepCompleted(state, LANGUAGE_STEP),
  isSetupCompleted: isSetupCompleted(state),
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onLocaleChange: (locale: Locale) => {
    dispatch(setLocale(locale));
  },
  onStepSelect: () => {
    dispatch(setStep(LANGUAGE_STEP));
  },
  onStepSubmit: () => {
    dispatch(setStep(USER_STEP));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(LanguageStep);
