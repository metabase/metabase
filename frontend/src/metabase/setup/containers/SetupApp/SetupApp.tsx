import { connect } from "react-redux";
import Setup from "../../components/Setup";
import { WELCOME_STEP } from "../../constants";
import { isStepActive } from "../../selectors";

const mapStateToProps = (state: any) => ({
  isWelcome: isStepActive(state, WELCOME_STEP),
});

export default connect(mapStateToProps)(Setup);
