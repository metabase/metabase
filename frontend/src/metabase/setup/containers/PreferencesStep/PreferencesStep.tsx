import { connect } from "react-redux";
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
} from "../../selectors";

const mapStateToProps = (state: any) => ({
  isTrackingAllowed: isTrackingAllowed(state),
  isStepActive: isStepActive(state, PREFERENCES_STEP),
  isStepCompleted: isStepCompleted(state, PREFERENCES_STEP),
  isSetupCompleted: isSetupCompleted(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onTrackingChange: (isTrackingAllowed: boolean) => {
    dispatch(setTracking(isTrackingAllowed));
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

export default connect(mapStateToProps, mapDispatchToProps)(PreferencesStep);
