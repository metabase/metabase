import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackSetup from "../../components/SlackSetup";
import SlackSetupForm from "../../containers/SlackSetupForm";
import { hasSlackBotToken, isSlackTokenValid } from "../../selectors";

const mapStateToProps = (state: State) => ({
  Form: SlackSetupForm,
  isBot: hasSlackBotToken(state),
  isValid: isSlackTokenValid(state),
});

export default connect(mapStateToProps)(SlackSetup);
