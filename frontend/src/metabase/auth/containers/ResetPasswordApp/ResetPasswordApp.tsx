import { connect } from "react-redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import ResetPassword from "../../components/ResetPassword";
import {
  resetPassword,
  validatePasswordResetToken,
} from "metabase/auth/actions";

const mapStateToProps = (state: any, props: any) => ({
  token: props.params.token,
  showScene: PLUGIN_SELECTORS.getShowAuthScene(state, props),
});

const mapDispatchToProps = {
  onResetPassword: resetPassword,
  onValidateToken: validatePasswordResetToken,
};

export default connect(mapStateToProps, mapDispatchToProps)(ResetPassword);
