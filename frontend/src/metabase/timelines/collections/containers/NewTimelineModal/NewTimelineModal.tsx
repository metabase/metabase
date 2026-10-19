import {
  skipToken,
  useCreateTimelineMutation,
  useGetCollectionQuery,
} from "metabase/api";
import { useNavigate } from "metabase/router";
import NewTimelineModal from "metabase/timelines/common/components/NewTimelineModal";
import * as Urls from "metabase/urls";
import type { CreateTimelineRequest, Timeline } from "metabase-types/api";

import { LoadingAndErrorModal } from "../../components/LoadingAndErrorModal";
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

  if (isLoading || error || !collection) {
    return (
      <LoadingAndErrorModal
        loading={isLoading}
        error={error}
        onClose={onClose}
      />
    );
  }

  return (
    <NewTimelineModal
      collection={collection}
      onSubmit={onSubmit}
      onClose={onClose}
      animated={false}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewTimelineModalContainer;
