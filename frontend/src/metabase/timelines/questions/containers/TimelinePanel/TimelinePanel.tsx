import _ from "underscore";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import TimelinePanel from "../../components/TimelinePanel";

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

export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
)(TimelinePanel);
