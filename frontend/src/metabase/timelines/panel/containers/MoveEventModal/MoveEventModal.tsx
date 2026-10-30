import { t } from "ttag";

import {
  useGetCollectionQuery,
  useGetTimelineEventQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { MoveEventForm } from "metabase/timelines/common/components/MoveEventForm";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import { useSetTimeline } from "metabase/timelines/common/hooks";
import type { CollectionId, Timeline, TimelineEvent } from "metabase-types/api";

interface MoveEventModalContainerProps {
  eventId: number;
  collectionId?: CollectionId | null;
  onClose: () => void;
}

function MoveEventModalContainer({
  eventId,
  collectionId,
  onClose,
}: MoveEventModalContainerProps) {
  const setTimeline = useSetTimeline();
  const { data: event, isLoading, error } = useGetTimelineEventQuery(eventId);
  const { data: timelines = [] } = useListTimelinesQuery({ include: "events" });
  const { data: collection } = useGetCollectionQuery({
    id: collectionId == null ? ROOT_COLLECTION.id : collectionId,
  });
  const handleSubmit = async (event: TimelineEvent, newTimeline?: Timeline) => {
    if (newTimeline) {
      await setTimeline(event, newTimeline);
    }
  };

  return (
    <TimelineModal
      title={event ? t`Move ${event.name}` : undefined}
      tall
      onClose={onClose}
    >
      {isLoading || error || !event ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <MoveEventForm
          event={event}
          timelines={timelines}
          collection={collection}
          onSubmit={handleSubmit}
          onSubmitSuccess={onClose}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveEventModalContainer;
