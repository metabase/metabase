import { connect } from "react-redux";
import WelcomePage from "../../components/WelcomePage";
import { setStep, loadUserDefaults, loadLocaleDefaults } from "../../actions";
import { trackWelcomeStepCompleted } from "../../analytics";
import { LANGUAGE_STEP } from "../../constants";

const mapDispatchToProps = (dispatch: any) => ({
  onStepShow: () => {
    dispatch(loadUserDefaults());
    dispatch(loadLocaleDefaults());
  },
  onStepSubmit: () => {
    dispatch(setStep(LANGUAGE_STEP));
    trackWelcomeStepCompleted();
  },
});

export default connect(null, mapDispatchToProps)(WelcomePage);
