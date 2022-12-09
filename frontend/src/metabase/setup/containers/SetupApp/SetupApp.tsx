import { connect } from "react-redux";
import { State } from "metabase-types/store";
import Setup from "../../components/Setup";
import { WELCOME_STEP } from "../../constants";
import { isStepActive } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isWelcome: isStepActive(state, WELCOME_STEP),
});

export default connect(mapStateToProps)(Setup);
