import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import PasswordButton from "../../components/PasswordButton";

const mapStateToProps = (state: State) => ({
  isLdapEnabled: getSetting(state, "ldap-enabled"),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, null)(PasswordButton);
