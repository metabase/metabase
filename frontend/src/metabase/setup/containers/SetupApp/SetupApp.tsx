import { connect } from "react-redux";
import Setup from "../../components/Setup";
import { isStepActive } from "../../selectors";
import { WELCOME_STEP } from "../../constants";

const mapStateToProps = (state: any) => ({
  isWelcome: isStepActive(state, WELCOME_STEP),
});

export default connect(mapStateToProps)(Setup);
