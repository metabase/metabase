import {
  skipToken,
  useDeleteTimelineEventMutation,
  useGetTimelineEventQuery,
} from "metabase/api";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import DeleteEventModal from "metabase/timelines/common/components/DeleteEventModal";
import * as Urls from "metabase/urls";
import type { TimelineEvent } from "metabase-types/api";

import { LoadingAndErrorModal } from "../../components/LoadingAndErrorModal";

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

  if (isLoading || error || !event) {
    return (
      <LoadingAndErrorModal
        loading={isLoading}
        error={error}
        onClose={onClose}
      />
    );
  }

  return (
    <DeleteEventModal
      event={event}
      onSubmit={onSubmit}
      onClose={onClose}
      animated={false}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventModalContainer;
