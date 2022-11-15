import { connect } from "react-redux";
import MetabaseSettings from "metabase/lib/settings";
import { getSetting } from "metabase/selectors/settings";
import { updateSettings } from "metabase/admin/settings/settings";
import { State } from "metabase-types/store";
import LdapAuthCard, { LdapAuthCardProps } from "../../components/LdapAuthCard";

type StateProps = Pick<LdapAuthCardProps, "isExtended" | "isConfigured">;
type DispatchProps = Pick<LdapAuthCardProps, "onChangeSettings">;

const mapStateToProps = (state: State): StateProps => ({
  isExtended: MetabaseSettings.isEnterprise(),
  isConfigured: getSetting(state, "ldap-configured?"),
});

const mapDispatchToProps: DispatchProps = {
  onChangeSettings: updateSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(LdapAuthCard);
