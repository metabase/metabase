import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { State, UserInfo } from "metabase-types/store";
import UserStep from "../../components/UserStep";
import { selectUserStep, submitUserInfo } from "../../actions";
import { USER_STEP } from "../../constants";
import {
  getUser,
  isLocaleLoaded,
  isSetupCompleted,
  isStepActive,
  isStepCompleted,
} from "../../selectors";
import { validatePassword } from "../../utils";

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
    dispatch(selectUserStep());
  },
  onStepSubmit: (user: UserInfo) => {
    dispatch(submitUserInfo(user));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(UserStep);
