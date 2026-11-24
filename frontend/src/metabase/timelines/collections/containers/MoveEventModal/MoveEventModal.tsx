import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useGetTimelineEventQuery,
  useListTimelinesQuery,
} from "metabase/api";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useNavigate } from "metabase/router";
import { MoveEventForm } from "metabase/timelines/common/components/MoveEventForm";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import { useSetTimeline } from "metabase/timelines/common/hooks";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

function MoveEventModalContainer({ params, onClose }: ModalComponentProps) {
  const setTimeline = useSetTimeline();
  const navigate = useNavigate();
  const eventId = Urls.extractEntityId(params.timelineEventId);
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: event,
    isLoading: isEventLoading,
    error: eventError,
  } = useGetTimelineEventQuery(eventId ?? skipToken);
  const {
    data: timelines = [],
    isLoading: isTimelinesLoading,
    error: timelinesError,
  } = useListTimelinesQuery({ include: "events" });
  const {
    data: collection,
    isLoading: isCollectionLoading,
    error: collectionError,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  const handleSubmit = async (
    event: TimelineEvent,
    newTimeline?: Timeline,
    oldTimeline?: Timeline,
  ) => {
    if (newTimeline) {
      await setTimeline(event, newTimeline);
    }
    if (oldTimeline) {
      navigate(Urls.timelineInCollection(oldTimeline));
    }
  };

  const isLoading = isEventLoading || isTimelinesLoading || isCollectionLoading;
  const error = eventError ?? timelinesError ?? collectionError;

  return (
    <TimelineModal
      title={event ? t`Move ${event.name}` : undefined}
      onClose={onClose}
      animated={false}
      tall
    >
      {isLoading || error || !event ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <MoveEventForm
          event={event}
          timelines={timelines}
          collection={collection}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveEventModalContainer;
