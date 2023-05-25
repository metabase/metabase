import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { Locale, State } from "metabase-types/store";
import LanguageStep from "../../components/LanguageStep";
import { selectStep, updateLocale } from "../../actions";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import {
  getLocale,
  getIsLocaleLoaded,
  getIsSetupCompleted,
  getIsStepActive,
  getIsStepCompleted,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  locale: getLocale(state),
  localeData: Settings.get("available-locales") || [],
  isStepActive: getIsStepActive(state, LANGUAGE_STEP),
  isStepCompleted: getIsStepCompleted(state, LANGUAGE_STEP),
  isSetupCompleted: getIsSetupCompleted(state),
  isLocaleLoaded: getIsLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onLocaleChange: (locale: Locale) => {
    dispatch(updateLocale(locale));
  },
  onStepSelect: () => {
    dispatch(selectStep(LANGUAGE_STEP));
  },
  onStepSubmit: () => {
    dispatch(selectStep(USER_STEP));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(LanguageStep);
