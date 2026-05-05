import { push } from "react-router-redux";

import {
  skipToken,
  useGetTimelineEventQuery,
  useGetTimelineQuery,
  useUpdateTimelineEventMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";

function EditEventModalContainer({ params }: ModalComponentProps) {
  const dispatch = useDispatch();
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
      dispatch(push(Urls.timelineInCollection(timeline)));
    }
  };

  const onArchive = async (event: TimelineEvent, timeline?: Timeline) => {
    await archive({ id: event.id, model: "timeline-event" }, true);
    if (timeline) {
      dispatch(push(Urls.timelineInCollection(timeline)));
    }
  };

  const isLoading = isTimelineLoading || isEventLoading;
  const error = timelineError ?? eventError;

  if (isLoading || error || !event) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <EditEventModal
      event={event}
      timeline={timeline}
      onSubmit={onSubmit}
      onArchive={onArchive}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModalContainer;
