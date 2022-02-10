import _ from "underscore";
import Collections from "metabase/entities/collections";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";

export interface NewEventModalProps {
  collectionId: string;
}

const collectionProps = {
  id: (state: State, props: NewEventModalProps) => props.collectionId,
};

export default _.compose(Collections.load(collectionProps))(NewEventModal);
