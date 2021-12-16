import { connect } from "react-redux";
import PreferencesStep from "../../components/PreferencesStep";
import { setTracking, submitSetup, setStep } from "../../actions";
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
  onChangeTracking: (isAllowed: boolean) => dispatch(setTracking(isAllowed)),
  onSubmitSetup: () => dispatch(submitSetup()),
  onSelectThisStep: () => dispatch(setStep(PREFERENCES_STEP)),
  onSelectNextStep: () => dispatch(setStep(COMPLETED_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(PreferencesStep);
