import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import { DatabaseData } from "metabase-types/api";
import { InviteInfo, State } from "metabase-types/store";
import DatabaseStep from "../../components/DatabaseStep";
import {
  skipDatabase,
  selectStep,
  submitDatabase,
  submitUserInvite,
  updateDatabaseEngine,
} from "../../actions";
import { DATABASE_STEP } from "../../constants";
import {
  getDatabase,
  getDatabaseEngine,
  getInvite,
  getUser,
  getIsLocaleLoaded,
  getIsSetupCompleted,
  getIsStepActive,
  getIsStepCompleted,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  database: getDatabase(state),
  engine: getDatabaseEngine(state),
  invite: getInvite(state),
  isEmailConfigured: Settings.isEmailConfigured(),
  isStepActive: getIsStepActive(state, DATABASE_STEP),
  isStepCompleted: getIsStepCompleted(state, DATABASE_STEP),
  isSetupCompleted: getIsSetupCompleted(state),
  isLocaleLoaded: getIsLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onEngineChange: (engine?: string) => {
    dispatch(updateDatabaseEngine(engine));
  },
  onStepSelect: () => {
    dispatch(selectStep(DATABASE_STEP));
  },
  onDatabaseSubmit: async (database: DatabaseData) => {
    await dispatch(submitDatabase(database));
  },
  onInviteSubmit: (invite: InviteInfo) => {
    dispatch(submitUserInvite(invite));
  },
  onStepCancel: (engine?: string) => {
    dispatch(skipDatabase(engine));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(DatabaseStep);
