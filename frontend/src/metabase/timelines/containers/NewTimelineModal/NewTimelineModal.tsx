import _ from "underscore";
import Collections from "metabase/entities/collections";
import { CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";
import NewTimelineModal from "../../components/NewTimelineModal";

export interface NewTimelineModalProps {
  collectionId: CollectionId;
}

const collectionProps = {
  id: (state: State, props: NewTimelineModalProps) => props.collectionId,
};

export default _.compose(Collections.load(collectionProps))(NewTimelineModal);
