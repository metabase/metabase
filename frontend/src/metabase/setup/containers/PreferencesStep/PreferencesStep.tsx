import { connect } from "react-redux";
import PreferencesStep from "../../components/PreferencesStep";
import { setTracking, submitSetup, setStep } from "../../actions";
import { PREFERENCES_STEP, COMPLETED_STEP } from "../../constants";
import {
  isTrackingAllowed,
  isStepActive,
  isStepFilled,
  isStepCompleted,
} from "../../selectors";

const mapStateToProps = (state: any) => ({
  isTrackingAllowed: isTrackingAllowed(state),
  isActive: isStepActive(state, PREFERENCES_STEP),
  isFilled: isStepFilled(state, PREFERENCES_STEP),
  isCompleted: isStepCompleted(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onChangeTracking: (isAllowed: boolean) => dispatch(setTracking(isAllowed)),
  onSubmitSetup: () => dispatch(submitSetup()),
  onSelectThisStep: () => dispatch(setStep(PREFERENCES_STEP)),
  onSelectNextStep: () => dispatch(setStep(COMPLETED_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(PreferencesStep);
