import { connect } from "react-redux";
import { State } from "metabase-types/store";
import DatabaseHelp from "../../components/DatabaseHelp";
import { DATABASE_STEP } from "../../constants";
import {
  getDatabaseEngine,
  getIsLocaleLoaded,
  getIsStepActive,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  engine: getDatabaseEngine(state),
  isStepActive: getIsStepActive(state, DATABASE_STEP),
  isLocaleLoaded: getIsLocaleLoaded(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(DatabaseHelp);
