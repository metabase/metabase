import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { updateSettings } from "metabase/admin/settings/settings";
import { State } from "metabase-types/store";
import JwtAuthCard, { JwtAuthCardProps } from "../../components/JwtAuthCard";

type StateProps = Pick<JwtAuthCardProps, "isConfigured">;
type DispatchProps = Pick<JwtAuthCardProps, "onChangeSettings">;

const mapStateToProps = (state: State): StateProps => ({
  isConfigured: getSetting(state, "jwt-configured"),
});

const mapDispatchToProps: DispatchProps = {
  onChangeSettings: updateSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(JwtAuthCard);
