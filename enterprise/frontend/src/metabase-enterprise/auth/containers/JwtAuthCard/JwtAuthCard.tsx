import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { updateSettings } from "metabase/admin/settings/settings";
import AuthCard from "metabase/admin/settings/auth/components/AuthCard";
import { Dispatch, State } from "metabase-types/store";
import { JWT_SCHEMA } from "../../constants";

const mapStateToProps = (state: State) => ({
  type: "jwt",
  name: t`JWT`,
  description: t`Allows users to login via a JWT Identity Provider.`,
  isConfigured: getSetting(state, "jwt-configured"),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onDeactivate: () => dispatch(updateSettings(JWT_SCHEMA.getDefault())),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
