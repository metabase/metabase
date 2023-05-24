import { connect } from "react-redux";
import { State } from "metabase-types/store";
import PreferencesStep from "../../components/PreferencesStep";
import {
  selectPreferencesStep,
  submitPreferencesStep,
  updateTracking,
} from "../../actions";
import { PREFERENCES_STEP } from "../../constants";
import {
  isLocaleLoaded,
  isSetupCompleted,
  isStepActive,
  isStepCompleted,
  isTrackingAllowed,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  isTrackingAllowed: isTrackingAllowed(state),
  isStepActive: isStepActive(state, PREFERENCES_STEP),
  isStepCompleted: isStepCompleted(state, PREFERENCES_STEP),
  isSetupCompleted: isSetupCompleted(state),
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onTrackingChange: (isTrackingAllowed: boolean) => {
    dispatch(updateTracking(isTrackingAllowed));
  },
  onStepSelect: () => {
    dispatch(selectPreferencesStep());
  },
  onStepSubmit: async (isTrackingAllowed: boolean) => {
    await dispatch(submitPreferencesStep(isTrackingAllowed));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(PreferencesStep);
