import { t } from "ttag";

import {
  skipToken,
  useCreateTimelineMutation,
  useGetCollectionQuery,
} from "metabase/api";
import { useNavigate } from "metabase/router";
import NewTimelineModal from "metabase/timelines/common/components/NewTimelineModal";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";
import type { CreateTimelineRequest, Timeline } from "metabase-types/api";

import type { ModalParams } from "../../types";

interface NewTimelineModalContainerProps {
  params: ModalParams;
  onClose: () => void;
}

function NewTimelineModalContainer({
  params,
  onClose,
}: NewTimelineModalContainerProps) {
  const navigate = useNavigate();
  const [createTimeline] = useCreateTimelineMutation();
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: collection,
    isLoading,
    error,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  const onSubmit = async (values: Partial<Timeline>) => {
    const timeline = await createTimeline(
      // Unjustified type cast. FIXME
      values as CreateTimelineRequest,
    ).unwrap();
    navigate(Urls.timelineInCollection({ ...timeline, collection }));
  };

  return (
    <TimelineModal
      title={t`New event timeline`}
      onClose={onClose}
      animated={false}
      density="relaxed"
      tall={isLoading || !!error || !collection}
    >
      {isLoading || error || !collection ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <NewTimelineModal
          collection={collection}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewTimelineModalContainer;
