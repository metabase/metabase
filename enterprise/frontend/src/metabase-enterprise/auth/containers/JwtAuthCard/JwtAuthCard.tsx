import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import AuthCard from "metabase/admin/settings/auth/components/AuthCard";
import { State } from "metabase-types/store";

const mapStateToProps = (state: State) => ({
  type: "jwt",
  name: t`JWT`,
  description: t`Allows users to login via a JWT Identity Provider.`,
  isConfigured: getSetting(state, "jwt-configured"),
});

export default connect(mapStateToProps)(AuthCard);
