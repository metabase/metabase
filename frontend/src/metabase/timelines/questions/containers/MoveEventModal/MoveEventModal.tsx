import { useGetTimelineEventQuery, useListTimelinesQuery } from "metabase/api";
import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
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

const collectionProps = {
  id: (state: State, props: OwnProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

type ContainerProps = Omit<
  MoveEventModalProps,
  "event" | "timelines" | "onSubmit" | "onSubmitSuccess"
> & {
  eventId: number;
  onClose?: () => void;
};

function MoveEventModalContainer({ eventId, ...props }: ContainerProps) {
  const setTimeline = useSetTimeline();
  const { data: event } = useGetTimelineEventQuery(eventId);
  const { data: timelines = [] } = useListTimelinesQuery({ include: "events" });
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
      timelines={timelines}
      onSubmit={handleSubmit}
      onSubmitSuccess={props.onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(MoveEventModalContainer);
