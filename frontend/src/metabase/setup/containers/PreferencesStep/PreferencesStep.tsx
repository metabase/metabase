import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { State } from "metabase-types/store";
import PreferencesStep from "../../components/PreferencesStep";
import { setTracking, submitSetup, setStep } from "../../actions";
import {
  trackTrackingChanged,
  trackSetupCompleted,
  trackPreferencesStepCompleted,
} from "../../analytics";
import { PREFERENCES_STEP, COMPLETED_STEP } from "../../constants";
import {
  isTrackingAllowed,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  isLocaleLoaded,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  isTrackingAllowed: isTrackingAllowed(state),
  isStepActive: isStepActive(state, PREFERENCES_STEP),
  isStepCompleted: isStepCompleted(state, PREFERENCES_STEP),
  isSetupCompleted: isSetupCompleted(state),
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onTrackingChange: (isTrackingAllowed: boolean) => {
    dispatch(setTracking(isTrackingAllowed));
    trackTrackingChanged(isTrackingAllowed);
    Settings.set("anon-tracking-enabled", isTrackingAllowed);
    trackTrackingChanged(isTrackingAllowed);
  },
  onStepSelect: () => {
    dispatch(setStep(PREFERENCES_STEP));
  },
  onStepSubmit: async (isTrackingAllowed: boolean) => {
    await dispatch(submitSetup());
    dispatch(setStep(COMPLETED_STEP));
    trackPreferencesStepCompleted(isTrackingAllowed);
    trackSetupCompleted();
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(PreferencesStep);
