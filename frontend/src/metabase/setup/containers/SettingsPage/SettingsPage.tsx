import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SettingsPage from "../../components/SettingsPage";
import { trackStepSeen } from "../../analytics";
import { getStep, isLocaleLoaded } from "../../selectors";

const mapStateToProps = (state: State) => ({
  step: getStep(state),
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = () => ({
  onStepShow: (step: number) => {
    trackStepSeen(step);
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(SettingsPage);
