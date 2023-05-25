import { connect } from "react-redux";
import { State } from "metabase-types/store";
import CompletedStep from "../../components/CompletedStep";
import { COMPLETED_STEP } from "../../constants";
import { getIsLocaleLoaded, getIsStepActive } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isStepActive: getIsStepActive(state, COMPLETED_STEP),
  isLocaleLoaded: getIsLocaleLoaded(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(CompletedStep);
