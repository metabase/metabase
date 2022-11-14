import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import AuthCard from "metabase/admin/settings/components/widgets/AuthCard";
import { Dispatch, State } from "metabase-types/store";
import { deleteJwtSettings } from "../../actions";

const mapStateToProps = (state: State) => ({
  type: "jwt",
  name: t`JWT`,
  description: t`Allows users to login via a JWT Identity Provider.`,
  isConfigured: getSetting(state, "jwt-configured"),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onDeactivate: () => dispatch(deleteJwtSettings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
