import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineModal from "../../components/TimelineModal";
import { getCollectionId, getTimelineId } from "../../selectors";

export default _.compose(
  Timelines.load({ id: getTimelineId }),
  Collections.load({ id: getCollectionId }),
)(TimelineModal);
