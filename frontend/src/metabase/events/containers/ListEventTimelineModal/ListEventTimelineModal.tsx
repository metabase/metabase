import { connect } from "react-redux";
import { createMockEventTimeline } from "metabase-types/api/mocks";
import ListEventTimelineModal from "../../components/ListEventTimelineModal";

const mapStateToProps = () => ({
  timelines: [createMockEventTimeline()],
});

export default connect(mapStateToProps)(ListEventTimelineModal);
