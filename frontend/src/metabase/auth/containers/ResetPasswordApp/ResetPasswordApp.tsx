import { connect } from "react-redux";
import ResetPassword from "../../components/ResetPassword";
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
};

export default connect(mapStateToProps, mapDispatchToProps)(ResetPassword);
