import { push } from "react-router-redux";
import _ from "underscore";

import {
  skipToken,
  useDeleteTimelineEventMutation,
  useGetTimelineEventQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Timelines } from "metabase/entities/timelines";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import DeleteEventModal from "metabase/timelines/common/components/DeleteEventModal";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import type { ModalParams } from "../../types";

interface DeleteEventModalContainerProps {
  params: ModalParams;
  timeline: Timeline;
}

const timelineProps = {
  id: (state: State, props: DeleteEventModalContainerProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
};

function DeleteEventModalContainer({
  params,
  timeline,
}: DeleteEventModalContainerProps) {
  const dispatch = useDispatch();
  const eventId = Urls.extractEntityId(params.timelineEventId);
  const {
    data: event,
    isLoading,
    error,
  } = useGetTimelineEventQuery(eventId ?? skipToken);
  const [deleteTimelineEvent] = useDeleteTimelineEventMutation();

  const onSubmit = async (event: TimelineEvent, timeline: Timeline) => {
    await deleteTimelineEvent(event.id).unwrap();
    dispatch(push(Urls.timelineArchiveInCollection(timeline)));
  };

  if (isLoading || error || !event) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <DeleteEventModal event={event} timeline={timeline} onSubmit={onSubmit} />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(Timelines.load(timelineProps))(
  DeleteEventModalContainer,
);
