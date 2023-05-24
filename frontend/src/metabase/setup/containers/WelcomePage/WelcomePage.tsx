import { connect } from "react-redux";
import { State } from "metabase-types/store";
import WelcomePage from "../../components/WelcomePage";
import { loadDefaults, selectStep } from "../../actions";
import { LANGUAGE_STEP } from "../../constants";
import { isLocaleLoaded } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onStepShow: () => {
    dispatch(loadDefaults());
  },
  onStepSubmit: () => {
    dispatch(selectStep(LANGUAGE_STEP));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(WelcomePage);
