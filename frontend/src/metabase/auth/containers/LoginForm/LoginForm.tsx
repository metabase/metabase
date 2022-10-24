import { connect } from "react-redux";
import { State } from "metabase-types/store";
import LoginForm from "../../components/LoginForm";

const mapStateToProps = (state: State) => ({
  isLdapEnabled: state.settings.values["ldap-enabled"],
  isCookieEnabled: state.settings.values["session-cookies"] ?? false,
});

export default connect(mapStateToProps)(LoginForm);
