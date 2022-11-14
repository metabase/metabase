import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { updateSetting } from "metabase/admin/settings/settings";
import AuthCard from "metabase/admin/settings/components/widgets/AuthCard";
import { Dispatch, State } from "metabase-types/store";
import { deleteSamlSettings } from "../../actions";

const ENABLED_KEY = "saml-enabled";
const CONFIGURED_KEY = "saml-configured";

const mapStateToProps = (state: State) => ({
  type: "saml",
  name: t`SAML`,
  description: t`Allows users to login via a SAML Identity Provider.`,
  isEnabled: getSetting(state, ENABLED_KEY),
  isConfigured: getSetting(state, CONFIGURED_KEY),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onChange: (value: boolean) =>
    dispatch(updateSetting({ key: ENABLED_KEY, value })),
  onDeactivate: () => dispatch(deleteSamlSettings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
