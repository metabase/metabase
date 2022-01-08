import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackSettings from "../../components/SlackSettings";
import { hasSlackAppToken } from "../../selectors";

const mapStateToProps = (state: State) => ({
  hasApp: hasSlackAppToken(state),
});

export default connect(mapStateToProps)(SlackSettings);
