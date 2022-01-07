import { connect } from "react-redux";
import { State } from "metabase-types/store";
import CompletedStep from "../../components/CompletedStep";
import { COMPLETED_STEP } from "../../constants";
import { getUser, isStepActive } from "../../selectors";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  isStepActive: isStepActive(state, COMPLETED_STEP),
});

export default connect(mapStateToProps)(CompletedStep);
