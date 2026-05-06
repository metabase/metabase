import _ from "underscore";

import { useGetTimelineEventQuery } from "metabase/api";
import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
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

const collectionProps = {
  id: (state: State, props: OwnProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

type ContainerProps = Omit<
  MoveEventModalProps,
  "event" | "onSubmit" | "onSubmitSuccess"
> & {
  eventId: number;
  onClose?: () => void;
};

function MoveEventModalContainer({ eventId, ...props }: ContainerProps) {
  const setTimeline = useSetTimeline();
  const { data: event } = useGetTimelineEventQuery(eventId);
  const handleSubmit = async (event: TimelineEvent, newTimeline?: Timeline) => {
    if (newTimeline) {
      await setTimeline(event, newTimeline);
    }
  };

  if (!event) {
    return null;
  }

  return (
    <MoveEventModal
      {...props}
      event={event}
      onSubmit={handleSubmit}
      onSubmitSuccess={props.onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelinesProps),
  Collections.load(collectionProps),
)(MoveEventModalContainer);
