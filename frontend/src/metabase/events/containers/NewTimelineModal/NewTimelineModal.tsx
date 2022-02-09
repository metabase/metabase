import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import EventTimelines from "metabase/entities/event-timelines";
import NewTimelineModal from "../../components/NewTimelineModal";

const mapDispatchToProps = {
  onSubmit: EventTimelines.actions.create,
  onCancel: goBack,
};

export default connect(null, mapDispatchToProps)(NewTimelineModal);
