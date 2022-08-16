import { connect } from "react-redux";
import { replace } from "react-router-redux";
import ResetPassword from "../../components/ResetPassword";
import { addUndo } from "metabase/redux/undo";
import {
  resetPassword,
  validatePassword,
  validatePasswordToken,
} from "../../actions";

const mapStateToProps = (state: any, props: any) => ({
  token: props.params.token,
});

const mapDispatchToProps = {
  onResetPassword: resetPassword,
  onValidatePassword: validatePassword,
  onValidatePasswordToken: validatePasswordToken,
  onShowToast: addUndo,
  onRedirect: replace,
};

export default connect(mapStateToProps, mapDispatchToProps)(ResetPassword);
