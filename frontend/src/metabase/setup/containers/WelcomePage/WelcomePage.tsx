import { connect } from "react-redux";
import { State } from "metabase-types/store";
import WelcomePage from "../../components/WelcomePage";
import { setStep, loadUserDefaults, loadLocaleDefaults } from "../../actions";
import { trackWelcomeStepCompleted, trackStepSeen } from "../../analytics";
import { LANGUAGE_STEP, WELCOME_STEP } from "../../constants";
import { isLocaleLoaded } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onStepShow: () => {
    dispatch(loadUserDefaults());
    dispatch(loadLocaleDefaults());
    trackStepSeen(WELCOME_STEP);
  },
  onStepSubmit: () => {
    dispatch(setStep(LANGUAGE_STEP));
    trackWelcomeStepCompleted();
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(WelcomePage);
