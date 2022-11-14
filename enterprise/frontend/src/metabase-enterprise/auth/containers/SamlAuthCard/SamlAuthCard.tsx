import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import AuthCard from "metabase/admin/settings/components/widgets/AuthCard";
import { Dispatch, State } from "metabase-types/store";
import { deleteSamlSettings } from "../../actions";

const mapStateToProps = (state: State) => ({
  type: "saml",
  name: t`SAML`,
  description: t`Allows users to login via a SAML Identity Provider.`,
  isConfigured: getSetting(state, "saml-configured"),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onDeactivate: () => dispatch(deleteSamlSettings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
