import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import UserStep from "../../components/UserStep";
import { setUser, validatePassword, setStep } from "../../actions";
import { trackUserStepCompleted } from "../../analytics";
import { USER_STEP, DATABASE_STEP } from "../../constants";
import {
  getUser,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
} from "../../selectors";
import { UserInfo } from "../../types";

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  isStepActive: isStepActive(state, USER_STEP),
  isStepCompleted: isStepCompleted(state, USER_STEP),
  isSetupCompleted: isSetupCompleted(state),
  isHosted: Settings.isHosted(),
});

const mapDispatchToProps = (dispatch: any) => ({
  onPasswordChange: (user: UserInfo) => {
    dispatch(validatePassword(user));
  },
  onStepSelect: () => {
    dispatch(setStep(USER_STEP));
  },
  onStepSubmit: (user: UserInfo) => {
    dispatch(setUser(user));
    dispatch(setStep(DATABASE_STEP));
    trackUserStepCompleted();
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(UserStep);
