import { t } from "ttag";

import {
  useGetTimelineEventQuery,
  useUpdateTimelineEventMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import type { TimelineEvent } from "metabase-types/api";

interface EditEventModalContainerProps {
  eventId: number;
  onClose?: () => void;
}

function EditEventModalContainer({
  eventId,
  onClose,
}: EditEventModalContainerProps) {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const { data: event } = useGetTimelineEventQuery(eventId);
  const [updateTimelineEvent] = useUpdateTimelineEventMutation();

  if (!event) {
    return null;
  }

  const onSubmit = async (event: TimelineEvent) => {
    await updateTimelineEvent(event).unwrap();
    dispatch(addUndo({ message: t`Updated event` }));
  };

  const onArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);

  return (
    <EditEventModal
      event={event}
      onSubmit={onSubmit}
      onSubmitSuccess={onClose}
      onArchive={onArchive}
      onArchiveSuccess={onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModalContainer;
