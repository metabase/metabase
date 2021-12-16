import { connect } from "react-redux";
import WelcomePage from "../../components/WelcomePage";
import { setStep, loadUserDefaults, loadLocaleDefaults } from "../../actions";
import { LANGUAGE_STEP } from "../../constants";

const mapDispatchToProps = (dispatch: any) => ({
  onSelectNextStep: () => dispatch(setStep(LANGUAGE_STEP)),
  onLoadUserDefaults: () => dispatch(loadUserDefaults()),
  onLoadLocaleDefaults: () => dispatch(loadLocaleDefaults()),
});

export default connect(null, mapDispatchToProps)(WelcomePage);
