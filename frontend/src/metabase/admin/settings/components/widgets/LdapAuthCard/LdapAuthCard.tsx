import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { State } from "metabase-types/store";
import AuthCard from "../AuthCard";

const mapStateToProps = (state: State) => ({
  type: "ldap",
  name: t`LDAP`,
  description: t`Allows users within your LDAP directory to log in to Metabase with their LDAP credentials, and allows automatic mapping of LDAP groups to Metabase groups.`,
  isConfigured: getSetting(state, "ldap-configured?"),
});

export default connect(mapStateToProps)(AuthCard);
