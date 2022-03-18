import { connect } from "react-redux";
import _ from "underscore";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";

interface TimelinePanelProps {
  cardId?: number;
  collectionId?: number;
}

const timelineProps = {
  query: (state: State, props: TimelinePanelProps) => ({
    cardId: props.cardId,
    include: "events",
  }),
};

const collectionProps = {
  id: (state: State, props: TimelinePanelProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (values: Partial<TimelineEvent>, collection: Collection) => {
    if (values.timeline_id) {
      await dispatch(TimelineEvents.actions.create(values));
    } else {
      await dispatch(Timelines.actions.createWithEvent(values, collection));
    }
  },
});

export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
