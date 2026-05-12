import { t } from "ttag";

import {
  useCreateTimelineEventMutation,
  useCreateTimelineMutation,
  useListTimelinesQuery,
} from "metabase/api";
import { getDefaultTimeline } from "metabase/common/utils/timelines";
import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import type {
  Collection,
  CreateTimelineEventRequest,
  CreateTimelineRequest,
  TimelineEvent,
} from "metabase-types/api";

interface NewEventModalContainerProps {
  cardId?: number;
  collectionId?: number;
  onClose?: () => void;
  collection?: Collection;
}

const collectionProps = {
  id: (state: State, props: NewEventModalContainerProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

function NewEventModalContainer({
  onClose,
  collection,
}: NewEventModalContainerProps) {
  const dispatch = useDispatch();
  const [createTimeline] = useCreateTimelineMutation();
  const [createTimelineEvent] = useCreateTimelineEventMutation();
  const { data: timelines = [] } = useListTimelinesQuery({ include: "events" });

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
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(NewEventModalContainer);
