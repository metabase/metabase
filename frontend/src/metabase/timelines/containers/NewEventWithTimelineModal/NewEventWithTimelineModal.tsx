import Collections from "metabase/entities/collections";
import NewEventModal from "../../components/NewEventModal";
import { getCollectionId } from "../../selectors";

export default Collections.load({ id: getCollectionId })(NewEventModal);
