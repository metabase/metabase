import { connect } from "react-redux";
import { State } from "metabase-types/store";
import { getSetting } from "metabase/selectors/settings";
import EventForm, {
  EventFormOwnProps,
  EventFormStateProps,
} from "../../components/EventForm";

const mapStateToProps = (state: State) => ({
  formattingSettings: getSetting(state, "custom-formatting"),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<EventFormStateProps, unknown, EventFormOwnProps, State>(
  mapStateToProps,
)(EventForm);
