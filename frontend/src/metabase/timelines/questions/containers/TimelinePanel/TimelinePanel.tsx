import Timelines from "metabase/entities/timelines";
import TimelinePanel from "../../components/TimelinePanel";
import { State } from "metabase-types/store";

interface TimelinePanelProps {
  cardId?: number;
}

const timelineProps = {
  query: (state: State, props: TimelinePanelProps) => ({
    cardId: props.cardId,
    include: "events",
  }),
};

export default Timelines.loadList(timelineProps)(TimelinePanel);
