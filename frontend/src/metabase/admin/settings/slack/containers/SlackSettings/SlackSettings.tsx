import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackSettings from "../../components/SlackSettings";
import { loadManifest } from "../../actions";
import { hasSlackAppToken } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isApp: hasSlackAppToken(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onLoadManifest: () => dispatch(loadManifest()),
});

export default connect(mapStateToProps, mapDispatchToProps)(SlackSettings);
