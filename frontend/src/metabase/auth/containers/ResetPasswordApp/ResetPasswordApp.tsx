import { connect } from "react-redux";
import { replace } from "react-router-redux";
import { addUndo } from "metabase/redux/undo";
import ResetPassword from "../../components/ResetPassword";
import {
  resetPassword,
  validatePassword,
  validatePasswordToken,
} from "../../actions";

const mapStateToProps = (state: any, props: any) => ({
  token: props.params.token,
  onValidatePassword: validatePassword,
});

const mapDispatchToProps = {
  onResetPassword: resetPassword,
  onValidatePasswordToken: validatePasswordToken,
  onShowToast: addUndo,
  onRedirect: replace,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(ResetPassword);
