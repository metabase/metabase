import { t } from "ttag";

import {
  skipToken,
  useDeleteTimelineEventMutation,
  useGetTimelineEventQuery,
} from "metabase/api";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { DeleteConfirmationFooter } from "metabase/timelines/common/components/DeleteConfirmationFooter";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";
import type { TimelineEvent } from "metabase-types/api";

function DeleteEventModalContainer({ params, onClose }: ModalComponentProps) {
  const eventId = Urls.extractEntityId(params.timelineEventId);
  const {
    data: event,
    isLoading,
    error,
  } = useGetTimelineEventQuery(eventId ?? skipToken);
  const [deleteTimelineEvent] = useDeleteTimelineEventMutation();

  const onSubmit = async (event: TimelineEvent) => {
    await deleteTimelineEvent(event.id).unwrap();
    onClose();
  };

  return (
    <TimelineModal
      title={event ? t`Delete ${event.name}?` : undefined}
      onClose={onClose}
      animated={false}
      tall={isLoading || !!error || !event}
    >
      {isLoading || error || !event ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <DeleteConfirmationFooter
          onDelete={() => onSubmit(event)}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventModalContainer;
