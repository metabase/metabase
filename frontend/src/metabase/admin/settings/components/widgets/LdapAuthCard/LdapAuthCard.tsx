import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { Dispatch, State } from "metabase-types/store";
import { updateSetting, deleteLdapSettings } from "../../../settings";
import AuthCard from "../AuthCard";

const ENABLED_KEY = "ldap-enabled";
const CONFIGURED_KEY = "ldap-configured?";

const mapStateToProps = (state: State) => ({
  type: "ldap",
  name: t`LDAP`,
  description: t`Allows users within your LDAP directory to log in to Metabase with their LDAP credentials, and allows automatic mapping of LDAP groups to Metabase groups.`,
  isEnabled: getSetting(state, ENABLED_KEY),
  isConfigured: getSetting(state, CONFIGURED_KEY),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onChange: (value: boolean) =>
    dispatch(updateSetting({ key: ENABLED_KEY, value })),
  onDeactivate: () => dispatch(deleteLdapSettings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
