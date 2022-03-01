import { connect } from "react-redux";
import { State } from "metabase-types/store";
import SlackStatus from "../../components/SlackStatus";
import SlackStatusForm from "../../containers/SlackStatusForm";
import { updateSettings } from "../../actions";
import { isSlackTokenValid } from "../../selectors";

const mapStateToProps = (state: State) => ({
  Form: SlackStatusForm,
  isValid: isSlackTokenValid(state),
});

const mapDispatchToProps = {
  onDelete: updateSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(SlackStatus);
