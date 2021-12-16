import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import UserStep from "../../components/UserStep";
import { setUser, validatePassword, setStep } from "../../actions";
import { USER_STEP, DATABASE_STEP } from "../../constants";
import {
  getUser,
  isStepActive,
  isStepFilled,
  isStepCompleted,
} from "../../selectors";
import { UserInfo } from "../../types";

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  isActive: isStepActive(state, USER_STEP),
  isFilled: isStepFilled(state, USER_STEP),
  isCompleted: isStepCompleted(state),
  isHosted: Settings.isHosted(),
});

const mapDispatchToProps = (dispatch: any) => ({
  onChangeUser: (user: UserInfo) => dispatch(setUser(user)),
  onValidatePassword: (user: UserInfo) => dispatch(validatePassword(user)),
  onSelectThisStep: () => dispatch(setStep(USER_STEP)),
  onSelectNextStep: () => dispatch(setStep(DATABASE_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(UserStep);
