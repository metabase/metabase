import { connect } from "react-redux";
import SlackSettings from "../../components/SlackSettings";

const mapStateToProps = () => ({
  hasApp: true,
});

export default connect(mapStateToProps)(SlackSettings);
