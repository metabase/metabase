import { connect } from "react-redux";
import UserStep from "../../components/UserStep";
import { setStep, setUser } from "../../actions";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import { getUser, isStepActive, isStepCompleted } from "../../selectors";
import { UserInfo } from "../../types";

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  isActive: isStepActive(state, USER_STEP),
  isCompleted: isStepCompleted(state, USER_STEP),
});

const mapDispatchToProps = (dispatch: any) => ({
  onChangeUser: (user: UserInfo) => dispatch(setUser(user)),
  onSelectThisStep: () => dispatch(setStep(LANGUAGE_STEP)),
  onSelectNextStep: () => dispatch(setStep(USER_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(UserStep);
