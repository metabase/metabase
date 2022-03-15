import { connect } from "react-redux";
import _ from "underscore";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { Collection, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";

interface TimelinePanelProps {
  cardId?: number;
  collectionId?: number;
}

const collectionProps = {
  id: (state: State, props: TimelinePanelProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (values: Partial<TimelineEvent>, collection: Collection) => {
    await dispatch(Timelines.actions.createWithEvent(values, collection));
  },
});

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
