import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { updateSettings } from "metabase/admin/settings/settings";
import { State } from "metabase-types/store";
import GoogleAuthCard, {
  GoogleAuthCardProps,
} from "../../components/GoogleAuthCard";

type StateProps = Pick<GoogleAuthCardProps, "isConfigured">;
type DispatchProps = Pick<GoogleAuthCardProps, "onChangeSettings">;

const mapStateToProps = (state: State): StateProps => ({
  isConfigured: getSetting(state, "google-auth-configured"),
});

const mapDispatchToProps: DispatchProps = {
  onChangeSettings: updateSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(GoogleAuthCard);
