import { t } from "ttag";

import {
  skipToken,
  useCreateTimelineEventMutation,
  useCreateTimelineMutation,
  useGetCollectionQuery,
} from "metabase/api";
import { getDefaultTimeline } from "metabase/common/utils/timelines";
import { useNavigate } from "metabase/router";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";
import type { Collection, TimelineEventData } from "metabase-types/api";

import type { ModalParams } from "../../types";

interface NewEventWithTimelineModalContainerProps {
  params: ModalParams;
  onClose: () => void;
}

function NewEventWithTimelineModalContainer({
  params,
  onClose,
}: NewEventWithTimelineModalContainerProps) {
  const navigate = useNavigate();
  const [createTimeline] = useCreateTimelineMutation();
  const [createTimelineEvent] = useCreateTimelineEventMutation();
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: collection,
    isLoading,
    error,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  const onSubmit = async (
    values: TimelineEventData,
    collection?: Collection,
  ) => {
    if (!collection) {
      return;
    }
    const timeline = await createTimeline(
      getDefaultTimeline(collection),
    ).unwrap();
    await createTimelineEvent({
      ...values,
      timeline_id: timeline.id,
    }).unwrap();
    navigate(Urls.timelinesInCollection(collection));
  };

  return (
    <TimelineModal
      title={t`New event`}
      onClose={onClose}
      animated={false}
      density="relaxed"
      tall={isLoading || !!error || !collection}
    >
      {isLoading || error || !collection ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <NewEventModal
          source="collections"
          collection={collection}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventWithTimelineModalContainer;
