import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { State, DatabaseInfo, InviteInfo } from "metabase-types/store";
import DatabaseStep from "../../components/DatabaseStep";
import { setDatabase, setInvite, setStep, submitDatabase } from "../../actions";
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
  getDatabaseEngine,
  getInvite,
  getUser,
  isLocaleLoaded,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  database: getDatabase(state),
  engine: getDatabaseEngine(state),
  invite: getInvite(state),
  isEmailConfigured: Settings.isEmailConfigured(),
  isStepActive: isStepActive(state, DATABASE_STEP),
  isStepCompleted: isStepCompleted(state, DATABASE_STEP),
  isSetupCompleted: isSetupCompleted(state),
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onEngineChange: (engine: string) => {
    trackDatabaseSelected(engine);
  },
  onStepSelect: () => {
    dispatch(setStep(DATABASE_STEP));
  },
  onDatabaseSubmit: async (database: DatabaseInfo) => {
    await dispatch(submitDatabase(database));
    dispatch(setInvite(null));
    dispatch(setStep(PREFERENCES_STEP));
    trackDatabaseStepCompleted(database.engine);
  },
  onInviteSubmit: (invite: InviteInfo) => {
    dispatch(setDatabase(null));
    dispatch(setInvite(invite));
    dispatch(setStep(PREFERENCES_STEP));
    trackDatabaseStepCompleted();
  },
  onStepCancel: (engine?: string) => {
    dispatch(setDatabase(null));
    dispatch(setInvite(null));
    dispatch(setStep(PREFERENCES_STEP));
    trackDatabaseStepCompleted();
    trackAddDataLaterClicked(engine);
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(DatabaseStep);
