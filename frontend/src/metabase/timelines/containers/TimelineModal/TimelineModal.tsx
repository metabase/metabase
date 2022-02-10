import Timelines from "metabase/entities/timelines";
import TimelineModal from "../../components/TimelineModal";
import { getTimelineId } from "../../selectors";

export default Timelines.load({ id: getTimelineId })(TimelineModal);
