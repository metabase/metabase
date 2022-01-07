import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackSetup from "../../components/SlackSetup";
import SlackSetupForm from "../../components/SlackSetupForm";
import { hasSlackBotToken } from "../../selectors";

const mapStateToProps = (state: State) => ({
  Form: SlackSetupForm,
  hasBot: hasSlackBotToken(state),
  hasError: false,
});

const mapDispatchToProps = () => ({
  onSubmit: () => undefined,
});

export default connect(mapStateToProps, mapDispatchToProps)(SlackSetup);
