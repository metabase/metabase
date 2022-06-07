import { connect } from "react-redux";
import { State } from "metabase-types/store";
import CompletedStep from "../../components/CompletedStep";
import { COMPLETED_STEP } from "../../constants";
import { isLocaleLoaded, isStepActive } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isStepActive: isStepActive(state, COMPLETED_STEP),
  isLocaleLoaded: isLocaleLoaded(state),
});

export default connect(mapStateToProps)(CompletedStep);
