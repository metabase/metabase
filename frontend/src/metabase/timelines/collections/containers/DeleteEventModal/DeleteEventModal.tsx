import { push } from "react-router-redux";

import {
  skipToken,
  useDeleteTimelineEventMutation,
  useGetTimelineEventQuery,
  useGetTimelineQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import DeleteEventModal from "metabase/timelines/common/components/DeleteEventModal";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

function DeleteEventModalContainer({ params }: ModalComponentProps) {
  const dispatch = useDispatch();
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
  const [deleteTimelineEvent] = useDeleteTimelineEventMutation();

  const onSubmit = async (event: TimelineEvent, timeline: Timeline) => {
    await deleteTimelineEvent(event.id).unwrap();
    dispatch(push(Urls.timelineArchiveInCollection(timeline)));
  };

  const isLoading = isTimelineLoading || isEventLoading;
  const error = timelineError ?? eventError;

  if (isLoading || error || !event || !timeline) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <DeleteEventModal event={event} timeline={timeline} onSubmit={onSubmit} />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventModalContainer;
