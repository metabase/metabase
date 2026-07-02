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
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import type {
  Collection,
  CollectionId,
  CreateTimelineEventRequest,
  CreateTimelineRequest,
  TimelineEvent,
} from "metabase-types/api";

interface NewEventModalContainerProps {
  cardId?: number;
  collectionId?: CollectionId | null;
  onClose?: () => void;
}

function NewEventModalContainer({
  collectionId,
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
    values: Partial<TimelineEvent>,
    collection?: Collection,
  ) => {
    if (values.timeline_id) {
      await createTimelineEvent(values as CreateTimelineEventRequest).unwrap();
    } else if (collection) {
      const timeline = await createTimeline(
        getDefaultTimeline(collection) as CreateTimelineRequest,
      ).unwrap();
      await createTimelineEvent({
        ...values,
        timeline_id: timeline.id,
      } as CreateTimelineEventRequest).unwrap();
    }
    dispatch(addUndo({ message: t`Created event` }));
  };

  return (
    <NewEventModal
      source="question"
      timelines={timelines}
      collection={collection}
      onSubmit={onSubmit}
      onSubmitSuccess={onClose}
      onClose={onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventModalContainer;
