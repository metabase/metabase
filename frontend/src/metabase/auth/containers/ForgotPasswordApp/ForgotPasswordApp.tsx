import { connect } from "react-redux";
import MetabaseSettings from "metabase/lib/settings";
import ForgotPassword from "../../components/ForgotPassword";
import { forgotPassword } from "../../actions";

const canResetPassword = () => {
  const isEmailConfigured = MetabaseSettings.isEmailConfigured();
  const isLdapEnabled = MetabaseSettings.isLdapEnabled();
  return isEmailConfigured && !isLdapEnabled;
};

const mapStateToProps = (state: any, props: any) => ({
  canResetPassword: canResetPassword(),
  initialEmail: props.location.query.email,
});

const mapDispatchToProps = {
  onResetPassword: forgotPassword,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(ForgotPassword);
