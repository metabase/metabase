import { connect } from "react-redux";
import SlackSetup from "../../components/SlackSetup";
import SlackSetupForm from "../../components/SlackSetupForm";

const mapStateToProps = () => ({
  Form: SlackSetupForm,
  hasBot: false,
  hasError: false,
});

const mapDispatchToProps = () => ({
  onSubmit: () => undefined,
});

export default connect(mapStateToProps, mapDispatchToProps)(SlackSetup);
