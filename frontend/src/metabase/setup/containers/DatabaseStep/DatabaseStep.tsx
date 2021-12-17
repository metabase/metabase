import { connect } from "react-redux";
import DatabaseStep from "../../components/DatabaseStep";
import { setStep, submitDatabase } from "../../actions";
import {
  trackDatabaseSelected,
  trackAddDataLaterClicked,
  trackDatabaseStepCompleted,
} from "../../analytics";
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
  isHosted: true,
  isStepActive: isStepActive(state, DATABASE_STEP),
  isStepCompleted: isStepCompleted(state, DATABASE_STEP),
  isSetupCompleted: isSetupCompleted(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onEngineChange: (engine: string) => {
    trackDatabaseSelected(engine);
  },
  onStepSelect: () => {
    dispatch(setStep(DATABASE_STEP));
  },
  onStepSubmit: async (database: DatabaseInfo) => {
    await dispatch(submitDatabase(database));
    dispatch(setStep(PREFERENCES_STEP));
    trackDatabaseStepCompleted();
  },
  onStepCancel: (engine?: string) => {
    dispatch(setStep(PREFERENCES_STEP));
    trackAddDataLaterClicked(engine);
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(DatabaseStep);
