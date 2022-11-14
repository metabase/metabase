import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { Dispatch, State } from "metabase-types/store";
import { deleteLdapSettings } from "../../../settings";
import AuthCard from "../AuthCard";

const mapStateToProps = (state: State) => ({
  type: "ldap",
  name: t`LDAP`,
  description: t`Allows users within your LDAP directory to log in to Metabase with their LDAP credentials, and allows automatic mapping of LDAP groups to Metabase groups.`,
  isConfigured: getSetting(state, "ldap-configured?"),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onDeactivate: () => dispatch(deleteLdapSettings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
