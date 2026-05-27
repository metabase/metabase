import { push } from "react-router-redux";

import {
  skipToken,
  useCreateTimelineEventMutation,
  useGetTimelineQuery,
} from "metabase/api";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import * as Urls from "metabase/urls";
import type {
  CreateTimelineEventRequest,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";

function NewEventModalContainer({ params }: ModalComponentProps) {
  const dispatch = useDispatch();
  const [createTimelineEvent] = useCreateTimelineEventMutation();
  const id = Urls.extractEntityId(params.timelineId);
  const {
    data: timeline,
    isLoading,
    error,
  } = useGetTimelineQuery(id != null ? { id, include: "events" } : skipToken);

  if (isLoading || error || !timeline) {
    return (
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper />
    );
  }

  const onSubmit = async (
    values: Partial<TimelineEvent>,
    _collection?: unknown,
    timeline?: Timeline,
  ) => {
    await createTimelineEvent(values as CreateTimelineEventRequest).unwrap();
    if (timeline) {
      dispatch(push(Urls.timelineInCollection(timeline)));
    }
  };

  return (
    <NewEventModal
      source="collections"
      timelines={[timeline]}
      onSubmit={onSubmit}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventModalContainer;
