import Collections from "metabase/entities/collections";
import NewTimelineModal from "../../components/NewTimelineModal";
import { getCollectionId } from "../../selectors";

export default Collections.load({
  id: getCollectionId,
})(NewTimelineModal);
