import { connect } from "react-redux";
import { getExternalAuthProviders } from "metabase/auth/selectors";
import { State } from "metabase-types/store";
import { login } from "../../actions";
import PasswordPanel from "../../components/PasswordPanel";

const mapStateToProps = (state: State) => ({
  providers: getExternalAuthProviders(state),
  isLdapEnabled: state.settings.values["ldap-enabled"],
  hasSessionCookies: state.settings.values["session-cookies"] ?? false,
});

const mapDispatchToProps = {
  onLogin: login,
};

export default connect(mapStateToProps, mapDispatchToProps)(PasswordPanel);
