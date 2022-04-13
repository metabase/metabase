import { connect } from "react-redux";
import { State } from "metabase-types/store";
import WelcomePage from "../../components/WelcomePage";
import { setStep, loadUserDefaults, loadLocaleDefaults } from "../../actions";
import { trackWelcomeStepCompleted, trackStepSeen } from "../../analytics";
import { LANGUAGE_STEP, WELCOME_STEP } from "../../constants";
import { getLocale } from "../../selectors";

const mapStateToProps = (state: State) => ({
  locale: getLocale(state),
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

export default connect(mapStateToProps, mapDispatchToProps)(WelcomePage);
