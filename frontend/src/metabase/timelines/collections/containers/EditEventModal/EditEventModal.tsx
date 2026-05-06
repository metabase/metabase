import { push } from "react-router-redux";
import _ from "underscore";

import {
  skipToken,
  useGetTimelineEventQuery,
  useUpdateTimelineEventMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import { Timelines } from "metabase/entities/timelines";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface EditEventModalContainerProps {
  params: ModalParams;
  timeline?: Timeline;
}

const timelineProps = {
  id: (state: State, props: EditEventModalContainerProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

function EditEventModalContainer({
  params,
  timeline,
}: EditEventModalContainerProps) {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const eventId = Urls.extractEntityId(params.timelineEventId);
  const {
    data: event,
    isLoading,
    error,
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
export default _.compose(Timelines.load(timelineProps))(
  EditEventModalContainer,
);
