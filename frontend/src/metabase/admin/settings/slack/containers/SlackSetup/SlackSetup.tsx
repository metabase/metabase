import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackSetup from "../../components/SlackSetup";
import SlackSetupForm from "../../containers/SlackSetupForm";
import { hasBotToken } from "../../selectors";

const mapStateToProps = (state: State) => ({
  Form: SlackSetupForm,
  hasBot: hasBotToken(state),
  hasTokenError: false,
});

export default connect(mapStateToProps)(SlackSetup);
