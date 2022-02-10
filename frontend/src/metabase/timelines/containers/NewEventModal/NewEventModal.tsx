import { connect } from "react-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { Collection, TimelineEvent } from "metabase-types/api";
import NewEventModal from "../../components/NewEventModal";
import { createEvent, setMode } from "../../actions";
import { getCollectionId, getTimelineId } from "../../selectors";

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: (values: Partial<TimelineEvent>, collection: Collection) =>
    dispatch(createEvent(values, collection)),
  onClose: () => dispatch(setMode("timeline-view")),
});

export default _.compose(
  Timelines.load({ id: getTimelineId }),
  Collections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(NewEventModal);
