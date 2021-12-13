import { connect } from "react-redux";
import WelcomePage from "../../components/WelcomePage";
import { setStep } from "../../actions";
import { LANGUAGE_STEP } from "../../constants";

const mapDispatchToProps = (dispatch: any) => ({
  onSelectNextStep: () => dispatch(setStep(LANGUAGE_STEP)),
});

export default connect(null, mapDispatchToProps)(WelcomePage);
