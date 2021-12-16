import { connect } from "react-redux";
import WelcomePage from "../../components/WelcomePage";
import { setStep, loadUserDefaults, loadLocaleDefaults } from "../../actions";

const mapDispatchToProps = {
  onChangeStep: setStep,
  onLoadUserDefaults: loadUserDefaults,
  onLoadLocaleDefaults: loadLocaleDefaults,
};

export default connect(null, mapDispatchToProps)(WelcomePage);
