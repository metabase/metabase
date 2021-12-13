import { connect } from "react-redux";
import Setup from "../../components/Setup";
import { getStep } from "../../selectors";

const mapStateToProps = (state: any) => ({
  step: getStep(state),
});

export default connect(mapStateToProps)(Setup);
