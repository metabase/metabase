import { connect } from "react-redux";
import { createMockEventTimeline } from "metabase-types/api/mocks";
import TimelineListModal from "../../components/TimelineListModal";

const mapStateToProps = () => ({
  timelines: [createMockEventTimeline()],
});

export default connect(mapStateToProps)(TimelineListModal);
