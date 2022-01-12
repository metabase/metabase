import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackStatusForm from "../../components/SlackStatusForm";
import { getSlackSettings } from "../../selectors";

const mapStateToProps = (state: State) => ({
  settings: getSlackSettings(state),
});

export default connect(mapStateToProps)(SlackStatusForm);
