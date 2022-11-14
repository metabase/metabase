import { t } from "ttag";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { Dispatch, State } from "metabase-types/store";
import { deleteGoogleSettings } from "../../../settings";
import AuthCard, { AuthCardProps } from "../AuthCard";

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
  onDeactivate: () => dispatch(deleteGoogleSettings()),
});

export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
