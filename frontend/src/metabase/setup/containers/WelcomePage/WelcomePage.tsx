import { connect } from "react-redux";
import WelcomePage from "../../components/WelcomePage";
import { setStep, loadUserDefaults, loadLocaleDefaults } from "../../actions";
import { LANGUAGE_STEP } from "../../constants";

const mapDispatchToProps = (dispatch: any) => ({
  onStepShow: () => {
    dispatch(loadUserDefaults());
    dispatch(loadLocaleDefaults());
  },
  onStepSubmit: () => {
    dispatch(setStep(LANGUAGE_STEP));
  },
});

export default connect(null, mapDispatchToProps)(WelcomePage);
