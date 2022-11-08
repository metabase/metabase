import { connect } from "react-redux";
import { State } from "metabase-types/store";
import EventForm, {
  EventFormOwnProps,
  EventFormStateProps,
} from "../../components/EventForm";

const mapStateToProps = (state: State) => ({
  formattingSettings: state.settings.values["custom-formatting"],
});

export default connect<EventFormStateProps, unknown, EventFormOwnProps, State>(
  mapStateToProps,
)(EventForm);
