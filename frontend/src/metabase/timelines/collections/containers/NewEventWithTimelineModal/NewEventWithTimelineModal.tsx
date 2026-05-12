import { push } from "react-router-redux";

import {
  useCreateTimelineEventMutation,
  useCreateTimelineMutation,
} from "metabase/api";
import { getDefaultTimeline } from "metabase/common/utils/timelines";
import { Collections } from "metabase/entities/collections";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CreateTimelineEventRequest,
  CreateTimelineRequest,
  TimelineEvent,
} from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface NewEventWithTimelineModalContainerProps {
  params: ModalParams;
  onClose?: () => void;
}

const collectionProps = {
  id: (state: State, props: NewEventWithTimelineModalContainerProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

function NewEventWithTimelineModalContainer(
  props: NewEventWithTimelineModalContainerProps,
) {
  const dispatch = useDispatch();
  const [createTimeline] = useCreateTimelineMutation();
  const [createTimelineEvent] = useCreateTimelineEventMutation();

  const onSubmit = async (
    values: Partial<TimelineEvent>,
    collection?: Collection,
  ) => {
    if (!collection) {
      return;
    }
    const timeline = await createTimeline(
      getDefaultTimeline(collection) as CreateTimelineRequest,
    ).unwrap();
    await createTimelineEvent({
      ...values,
      timeline_id: timeline.id,
    } as CreateTimelineEventRequest).unwrap();
    dispatch(push(Urls.timelinesInCollection(collection)));
  };

  return <NewEventModal {...props} source="collections" onSubmit={onSubmit} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(
  NewEventWithTimelineModalContainer,
);
