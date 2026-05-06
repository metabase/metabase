import { t } from "ttag";

import {
  useCreateTimelineEventMutation,
  useListTimelinesQuery,
} from "metabase/api";
import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import { Timelines } from "metabase/entities/timelines";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import type {
  Collection,
  CreateTimelineEventRequest,
  Timeline,
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
}: NewEventModalContainerProps & { timelines?: Timeline[] }) {
  const dispatch = useDispatch();
  const [createTimelineEvent] = useCreateTimelineEventMutation();
  const { data: timelines = [] } = useListTimelinesQuery({ include: "events" });

  const onSubmit = async (
    values: Partial<TimelineEvent>,
    collection?: Collection,
  ) => {
    if (values.timeline_id) {
      await createTimelineEvent(values as CreateTimelineEventRequest).unwrap();
    } else if (collection) {
      await dispatch(Timelines.actions.createWithEvent(values, collection));
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
