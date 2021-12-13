import { connect } from "react-redux";
import UserStep from "../../components/UserStep";
import { setStep } from "../../actions";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import { isStepActive, isStepCompleted } from "../../selectors";

const mapStateToProps = (state: any) => ({
  isActive: isStepActive(state, USER_STEP),
  isCompleted: isStepCompleted(state, USER_STEP),
});

const mapDispatchToProps = (dispatch: any) => ({
  onSelectThisStep: () => dispatch(setStep(LANGUAGE_STEP)),
  onSelectNextStep: () => dispatch(setStep(USER_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(UserStep);
