import { connect } from "react-redux";
import { State } from "metabase-types/store";
import TimelineApp from "../../components/TimelineApp/TimelineApp";
import { getMode } from "../../selectors";

const mapStateToProps = (state: State) => ({
  mode: getMode(state),
});

export default connect(mapStateToProps)(TimelineApp);
