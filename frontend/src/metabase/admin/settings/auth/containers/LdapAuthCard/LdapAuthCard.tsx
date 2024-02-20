import { connect } from "react-redux";
import { t } from "ttag";

import { updateSettings } from "metabase/admin/settings/settings";
import { getSetting } from "metabase/selectors/settings";
import type { Dispatch, State } from "metabase-types/store";

import AuthCard from "../../components/AuthCard";
import { LDAP_SCHEMA } from "../../constants";

const mapStateToProps = (state: State) => ({
  type: "ldap",
  name: t`LDAP`,
  description: t`Allows users within your LDAP directory to log in to Metabase with their LDAP credentials, and allows automatic mapping of LDAP groups to Metabase groups.`,
  isConfigured: getSetting(state, "ldap-configured?"),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onDeactivate: () => dispatch(updateSettings(LDAP_SCHEMA.getDefault())),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
