import { t } from "ttag";

import {
  useGetTimelineEventQuery,
  useUpdateTimelineEventMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import EditEventForm from "metabase/timelines/common/components/EditEventForm";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import type { TimelineEvent } from "metabase-types/api";

interface EditEventModalContainerProps {
  eventId: number;
  onClose: () => void;
}

function EditEventModalContainer({
  eventId,
  onClose,
}: EditEventModalContainerProps) {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const { data: event, isLoading, error } = useGetTimelineEventQuery(eventId);
  const [updateTimelineEvent] = useUpdateTimelineEventMutation();

  const onSubmit = async (event: TimelineEvent) => {
    await updateTimelineEvent(event).unwrap();
    dispatch(addUndo({ message: t`Updated event` }));
  };

  const onArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);

  return (
    <TimelineModal
      title={t`Edit event`}
      density="relaxed"
      tall={isLoading || !!error || !event}
      onClose={onClose}
    >
      {isLoading || error || !event ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <EditEventForm
          event={event}
          onSubmit={onSubmit}
          onSubmitSuccess={onClose}
          onArchive={onArchive}
          onArchiveSuccess={onClose}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModalContainer;
