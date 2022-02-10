import { connect } from "react-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineListModal from "../../components/TimelineListModal";
import { getCollectionId, getTimelineQuery } from "../../selectors";
import { setMode } from "metabase/timelines/actions";

const mapDispatchToProps = (dispatch: any) => ({
  onCreateEvent: () => dispatch(setMode("timeline-event-new-default")),
  onCreateTimeline: () => dispatch(setMode("timeline-new")),
});

export default _.compose(
  Timelines.loadList({ query: getTimelineQuery }),
  Collections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(TimelineListModal);
