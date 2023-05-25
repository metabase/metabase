import { connect } from "react-redux";
import { State } from "metabase-types/store";
import Setup from "../../components/Setup";
import { WELCOME_STEP } from "../../constants";
import { getIsStepActive } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isWelcome: getIsStepActive(state, WELCOME_STEP),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(Setup);
