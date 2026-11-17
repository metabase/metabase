import { t } from "ttag";

import {
  skipToken,
  useGetTimelineEventQuery,
  useGetTimelineQuery,
  useUpdateTimelineEventMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useNavigate } from "metabase/router";
import EditEventForm from "metabase/timelines/common/components/EditEventForm";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

function EditEventModalContainer({ params, onClose }: ModalComponentProps) {
  const navigate = useNavigate();
  const archive = useSetArchive();
  const timelineId = Urls.extractEntityId(params.timelineId);
  const eventId = Urls.extractEntityId(params.timelineEventId);
  const {
    data: timeline,
    isLoading: isTimelineLoading,
    error: timelineError,
  } = useGetTimelineQuery(
    timelineId != null ? { id: timelineId, include: "events" } : skipToken,
  );
  const {
    data: event,
    isLoading: isEventLoading,
    error: eventError,
  } = useGetTimelineEventQuery(eventId ?? skipToken);
  const [updateTimelineEvent] = useUpdateTimelineEventMutation();

  const onSubmit = async (event: TimelineEvent, timeline?: Timeline) => {
    await updateTimelineEvent(event).unwrap();
    if (timeline) {
      navigate(Urls.timelineInCollection(timeline));
    }
  };

  const onArchive = async (event: TimelineEvent, timeline?: Timeline) => {
    await archive({ id: event.id, model: "timeline-event" }, true);
    if (timeline) {
      navigate(Urls.timelineInCollection(timeline));
    }
  };

  const isLoading = isTimelineLoading || isEventLoading;
  const error = timelineError ?? eventError;

  return (
    <TimelineModal
      title={t`Edit event`}
      onClose={onClose}
      animated={false}
      density="relaxed"
      tall={isLoading || !!error || !event}
    >
      {isLoading || error || !event ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <EditEventForm
          event={event}
          timeline={timeline}
          onSubmit={onSubmit}
          onArchive={onArchive}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModalContainer;
