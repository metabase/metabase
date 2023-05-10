import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { getExternalAuthProviders } from "metabase/auth/selectors";
import type { State } from "metabase-types/store";
import { login } from "../../actions";
import PasswordPanel from "../../components/PasswordPanel";

const mapStateToProps = (state: State) => ({
  providers: getExternalAuthProviders(state),
  isLdapEnabled: getSetting(state, "ldap-enabled"),
  hasSessionCookies: getSetting(state, "session-cookies") ?? false,
});

const mapDispatchToProps = {
  onLogin: login,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(PasswordPanel);
