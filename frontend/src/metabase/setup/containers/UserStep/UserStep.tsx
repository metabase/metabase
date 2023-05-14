import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { State, UserInfo } from "metabase-types/store";
import UserStep from "../../components/UserStep";
import { setUser, validatePassword, setStep } from "../../actions";
import { trackUserStepCompleted } from "../../analytics";
import { USER_STEP, DATABASE_STEP } from "../../constants";
import {
  getUser,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  isLocaleLoaded,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  isHosted: Settings.isHosted(),
  isStepActive: isStepActive(state, USER_STEP),
  isStepCompleted: isStepCompleted(state, USER_STEP),
  isSetupCompleted: isSetupCompleted(state),
  isLocaleLoaded: isLocaleLoaded(state),
  onValidatePassword: validatePassword,
});

const mapDispatchToProps = (dispatch: any) => ({
  onStepSelect: () => {
    dispatch(setStep(USER_STEP));
  },
  onStepSubmit: (user: UserInfo) => {
    dispatch(setUser(user));
    dispatch(setStep(DATABASE_STEP));
    trackUserStepCompleted();
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(UserStep);
