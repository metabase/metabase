import { connect } from "react-redux";
import PreferencesStep from "../../components/PreferencesStep";
import { setTracking, submitSetup, setStep } from "../../actions";
import { trackTrackingChanged } from "../../analytics";
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
  onTrackingChange: (isAllowed: boolean) => {
    dispatch(setTracking(isAllowed));
    trackTrackingChanged(isAllowed);
  },
  onStepSelect: () => {
    return dispatch(setStep(PREFERENCES_STEP));
  },
  onStepSubmit: async () => {
    await dispatch(submitSetup());
    dispatch(setStep(COMPLETED_STEP));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(PreferencesStep);
