import { connect } from "react-redux";
import { State } from "metabase-types/store";
import PasswordButton from "../../components/PasswordButton";

const mapStateToProps = (state: State) => ({
  isLdapEnabled: state.settings.values["ldap-enabled"],
});

export default connect(mapStateToProps, null)(PasswordButton);
