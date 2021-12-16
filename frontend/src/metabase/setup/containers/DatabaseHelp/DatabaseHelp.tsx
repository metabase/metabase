import { connect } from "react-redux";
import DatabaseHelp from "../../components/DatabaseHelp";
import { DATABASE_STEP } from "../../constants";
import { getDatabaseEngine, isStepActive } from "../../selectors";

const mapStateToProps = (state: any) => ({
  engine: getDatabaseEngine(state),
  isStepActive: isStepActive(state, DATABASE_STEP),
});

export default connect(mapStateToProps)(DatabaseHelp);
