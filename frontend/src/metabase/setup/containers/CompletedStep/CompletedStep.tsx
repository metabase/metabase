import { connect } from "react-redux";
import CompletedStep from "../../components/CompletedStep";
import { COMPLETED_STEP } from "../../constants";
import { getUser, isStepActive } from "../../selectors";

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  isActive: isStepActive(state, COMPLETED_STEP),
});

export default connect(mapStateToProps)(CompletedStep);
