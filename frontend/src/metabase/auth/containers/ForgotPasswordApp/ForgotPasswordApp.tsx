import { connect } from "react-redux";
import MetabaseSettings from "metabase/lib/settings";
import ForgotPassword from "../../components/ForgotPassword";
import { forgotPassword } from "../../actions";

const canResetPassword = () => {
  const isEmailConfigured = MetabaseSettings.isEmailConfigured();
  const isLdapConfigured = MetabaseSettings.isLdapConfigured();
  return isEmailConfigured && !isLdapConfigured;
};

const mapStateToProps = (state: any, props: any) => ({
  canResetPassword: canResetPassword(),
  initialEmail: props.location.query.email,
});

const mapDispatchToProps = {
  onResetPassword: forgotPassword,
};

export default connect(mapStateToProps, mapDispatchToProps)(ForgotPassword);
