import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import NewEventModal from "../../components/NewEventModal";
import { getCollectionId, getTimelineId } from "../../selectors";

export default _.compose(
  Timelines.load({ id: getTimelineId }),
  Collections.load({ id: getCollectionId }),
)(NewEventModal);
