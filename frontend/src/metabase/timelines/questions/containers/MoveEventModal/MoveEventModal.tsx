import {
  useGetCollectionQuery,
  useGetTimelineEventQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import MoveEventModal, {
  type MoveEventModalProps,
} from "metabase/timelines/common/components/MoveEventModal";
import { useSetTimeline } from "metabase/timelines/common/hooks";
import type { CollectionId, Timeline, TimelineEvent } from "metabase-types/api";

type ContainerProps = Omit<
  MoveEventModalProps,
  "event" | "timelines" | "collection" | "onSubmit" | "onSubmitSuccess"
> & {
  eventId: number;
  collectionId?: CollectionId | null;
  onClose?: () => void;
};

function MoveEventModalContainer({
  eventId,
  collectionId,
  ...props
}: ContainerProps) {
  const setTimeline = useSetTimeline();
  const { data: event } = useGetTimelineEventQuery(eventId);
  const { data: timelines = [] } = useListTimelinesQuery({ include: "events" });
  const { data: collection } = useGetCollectionQuery({
    id: collectionId == null ? ROOT_COLLECTION.id : collectionId,
  });
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
      collection={collection}
      onSubmit={handleSubmit}
      onSubmitSuccess={props.onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveEventModalContainer;
