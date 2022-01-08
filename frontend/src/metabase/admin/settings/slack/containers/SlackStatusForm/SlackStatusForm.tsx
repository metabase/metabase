import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackStatusForm from "../../components/SlackStatusForm";
import { getSlackAppToken, getSlackFilesChannel } from "../../selectors";

const mapStateToProps = (state: State) => ({
  token: getSlackAppToken(state),
  channel: getSlackFilesChannel(state),
});

export default connect(mapStateToProps)(SlackStatusForm);
