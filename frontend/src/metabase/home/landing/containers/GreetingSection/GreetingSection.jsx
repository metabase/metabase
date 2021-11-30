import { connect } from "react-redux";
import GreetingSection from "../../components/GreetingSection";
import { getGreeting } from "../../selectors";

const mapStateToProps = state => ({
  greeting: getGreeting(state),
});

export default connect(mapStateToProps)(GreetingSection);
