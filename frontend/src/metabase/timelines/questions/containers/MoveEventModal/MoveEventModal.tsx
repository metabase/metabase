import _ from "underscore";

import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import { TimelineEvents } from "metabase/entities/timeline-events";
import { Timelines } from "metabase/entities/timelines";
import type { State } from "metabase/redux/store";
import MoveEventModal, {
  type MoveEventModalProps,
} from "metabase/timelines/common/components/MoveEventModal";
import { useSetTimeline } from "metabase/timelines/common/hooks";
import type { Timeline, TimelineEvent } from "metabase-types/api";

interface OwnProps {
  eventId: number;
  collectionId?: number;
  onClose?: () => void;
}

const timelinesProps = {
  query: { include: "events" },
};

const timelineEventProps = {
  id: (state: State, props: OwnProps) => props.eventId,
  entityAlias: "event",
};

const collectionProps = {
  id: (state: State, props: OwnProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

type ContainerProps = Omit<MoveEventModalProps, "onSubmit" | "onSubmitSuccess">;

function MoveEventModalContainer(props: ContainerProps) {
  const setTimeline = useSetTimeline();
  const handleSubmit = async (event: TimelineEvent, newTimeline?: Timeline) => {
    if (newTimeline) {
      await setTimeline(event, newTimeline);
    }
  };
  return (
    <MoveEventModal
      {...props}
      onSubmit={handleSubmit}
      onSubmitSuccess={props.onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelinesProps),
  TimelineEvents.load(timelineEventProps),
  Collections.load(collectionProps),
)(MoveEventModalContainer);
