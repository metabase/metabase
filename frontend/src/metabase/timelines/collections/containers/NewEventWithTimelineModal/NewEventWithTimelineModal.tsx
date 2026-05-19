import { push } from "react-router-redux";

import {
  skipToken,
  useCreateTimelineEventMutation,
  useCreateTimelineMutation,
  useGetCollectionQuery,
} from "metabase/api";
import { getDefaultTimeline } from "metabase/common/utils/timelines";
import { useDispatch } from "metabase/redux";
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

function NewEventWithTimelineModalContainer(
  props: NewEventWithTimelineModalContainerProps,
) {
  const dispatch = useDispatch();
  const [createTimeline] = useCreateTimelineMutation();
  const [createTimelineEvent] = useCreateTimelineEventMutation();
  const collectionId = Urls.extractCollectionId(props.params.slug);
  const {
    data: collection,
    isLoading,
    error,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

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

  if (isLoading || error || !collection) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <NewEventModal
      {...props}
      source="collections"
      collection={collection}
      onSubmit={onSubmit}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventWithTimelineModalContainer;
