import { connect } from "react-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import { Collection, TimelineEvent } from "metabase-types/api";
import NewEventModal from "../../components/NewEventModal";
import { createTimelineWithEvent, setMode } from "../../actions";
import { getCollectionId } from "../../selectors";

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: (values: Partial<TimelineEvent>, collection: Collection) =>
    dispatch(createTimelineWithEvent(values, collection)),
  onClose: () => dispatch(setMode("timeline-view")),
});

export default _.compose(
  Collections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(NewEventModal);
