import { connect } from "react-redux";
import SlackSettings from "../../components/SlackSettings";

const mapStateToProps = () => ({
  hasApp: false,
});

export default connect(mapStateToProps)(SlackSettings);
