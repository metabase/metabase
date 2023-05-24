import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { Locale, State } from "metabase-types/store";
import LanguageStep from "../../components/LanguageStep";
import {
  selectLanguageStep,
  submitLanguageInfo,
  updateLocale,
} from "../../actions";
import { LANGUAGE_STEP } from "../../constants";
import {
  getLocale,
  isLocaleLoaded,
  isSetupCompleted,
  isStepActive,
  isStepCompleted,
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
    dispatch(updateLocale(locale));
  },
  onStepSelect: () => {
    dispatch(selectLanguageStep());
  },
  onStepSubmit: () => {
    dispatch(submitLanguageInfo());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(LanguageStep);
