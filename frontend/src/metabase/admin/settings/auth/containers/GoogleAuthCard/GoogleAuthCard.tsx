import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { updateSettings } from "metabase/admin/settings/settings";
import { Dispatch, State } from "metabase-types/store";
import AuthCard, { AuthCardProps } from "../../components/AuthCard";
import { GOOGLE_SCHEMA } from "../../constants";

type StateProps = Omit<AuthCardProps, "setting" | "onChange" | "onDeactivate">;
type DispatchProps = Pick<AuthCardProps, "onDeactivate">;

const mapStateToProps = (state: State): StateProps => ({
  type: "google",
  name: t`Google Sign-in`,
  title: t`Sign in with Google`,
  description: t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`,
  isConfigured: getSetting(state, "google-auth-configured"),
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onDeactivate: () => dispatch(updateSettings(GOOGLE_SCHEMA.getDefault())),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
