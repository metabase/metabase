import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineListModal from "../../components/TimelineListModal";
import { getCollectionId, getTimelineQuery } from "../../selectors";

export default _.compose(
  Timelines.loadList({ query: getTimelineQuery }),
  Collections.load({ id: getCollectionId }),
)(TimelineListModal);
