import {
  skipToken,
  useDeleteTimelineEventMutation,
  useGetTimelineEventQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import DeleteEventModal from "metabase/timelines/common/components/DeleteEventModal";
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

  if (isLoading || error || !event) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <DeleteEventModal event={event} onSubmit={onSubmit} onClose={onClose} />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventModalContainer;
