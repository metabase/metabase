import { connect } from "react-redux";

import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import type {
  EventFormOwnProps,
  EventFormStateProps,
} from "../../components/EventForm";
import EventForm from "../../components/EventForm";

const mapStateToProps = (state: State) => ({
  formattingSettings: getSetting(state, "custom-formatting"),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<EventFormStateProps, unknown, EventFormOwnProps, State>(
  mapStateToProps,
)(EventForm);
