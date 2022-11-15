import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { updateSettings } from "metabase/admin/settings/settings";
import { State } from "metabase-types/store";
import LdapAuthCard, { LdapAuthCardProps } from "../../components/LdapAuthCard";

type StateProps = Pick<LdapAuthCardProps, "isConfigured">;
type DispatchProps = Pick<LdapAuthCardProps, "onChangeSettings">;

const mapStateToProps = (state: State): StateProps => ({
  isConfigured: getSetting(state, "ldap-auth-configured"),
});

const mapDispatchToProps: DispatchProps = {
  onChangeSettings: updateSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(LdapAuthCard);
