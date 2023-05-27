import { connect } from "react-redux";
import { State } from "metabase-types/store";
import DatabaseHelp from "../../components/DatabaseHelp";
import { DATABASE_STEP } from "../../constants";
import {
  getDatabaseEngine,
  isLocaleLoaded,
  isStepActive,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  engine: getDatabaseEngine(state),
  isStepActive: isStepActive(state, DATABASE_STEP),
  isLocaleLoaded: isLocaleLoaded(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(DatabaseHelp);
