import { connect } from "react-redux";
import DatabaseStep from "../../components/DatabaseStep";
import { setDatabase, validateDatabase, setStep } from "../../actions";
import { DATABASE_STEP, PREFERENCES_STEP } from "../../constants";
import {
  getDatabase,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
} from "../../selectors";
import { DatabaseInfo } from "../../types";

const mapStateToProps = (state: any) => ({
  database: getDatabase(state),
  isStepActive: isStepActive(state, DATABASE_STEP),
  isStepCompleted: isStepCompleted(state, DATABASE_STEP),
  isSetupCompleted: isSetupCompleted(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onChangeDatabase: (database: DatabaseInfo | null) =>
    dispatch(setDatabase(database)),
  onValidateDatabase: (database: DatabaseInfo) =>
    dispatch(validateDatabase(database)),
  onSelectThisStep: () => dispatch(setStep(DATABASE_STEP)),
  onSelectNextStep: () => dispatch(setStep(PREFERENCES_STEP)),
});

export default connect(mapStateToProps, mapDispatchToProps)(DatabaseStep);
