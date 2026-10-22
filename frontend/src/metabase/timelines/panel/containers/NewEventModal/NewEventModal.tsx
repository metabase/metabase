import { t } from "ttag";

import {
  useCreateTimelineEventMutation,
  useCreateTimelineMutation,
  useGetCollectionQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { getDefaultTimeline } from "metabase/common/utils/timelines";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import NewEventForm from "metabase/timelines/common/components/NewEventForm";
import { TimelineModal } from "metabase/timelines/common/components/TimelineModal";
import type {
  Collection,
  CollectionId,
  TimelineEvent,
  TimelineEventData,
  TimelineEventSource,
} from "metabase-types/api";

interface NewEventModalContainerProps {
  collectionId?: CollectionId | null;
  source?: TimelineEventSource;
  onEventCreated?: (event: TimelineEvent) => void;
  onClose: () => void;
}

function NewEventModalContainer({
  collectionId,
  source = "question",
  onEventCreated,
  onClose,
}: NewEventModalContainerProps) {
  const dispatch = useDispatch();
  const [createTimeline] = useCreateTimelineMutation();
  const [createTimelineEvent] = useCreateTimelineEventMutation();
  const { data: timelines = [] } = useListTimelinesQuery({ include: "events" });
  const { data: collection } = useGetCollectionQuery({
    id: collectionId == null ? ROOT_COLLECTION.id : collectionId,
  });

  const onSubmit = async (
    values: TimelineEventData,
    collection?: Collection,
  ) => {
    if (values.timeline_id != null) {
      const event = await createTimelineEvent({
        ...values,
        timeline_id: values.timeline_id,
      }).unwrap();
      onEventCreated?.(event);
    } else if (collection) {
      const timeline = await createTimeline(
        getDefaultTimeline(collection),
      ).unwrap();
      const event = await createTimelineEvent({
        ...values,
        timeline_id: timeline.id,
      }).unwrap();
      onEventCreated?.(event);
    }
    dispatch(addUndo({ message: t`Created event` }));
  };

  return (
    <TimelineModal title={t`New event`} density="relaxed" onClose={onClose}>
      <NewEventForm
        source={source}
        timelines={timelines}
        collection={collection}
        onSubmit={onSubmit}
        onSubmitSuccess={onClose}
        onCancel={onClose}
      />
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventModalContainer;
