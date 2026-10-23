import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import * as Urls from "metabase/urls";

import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListModalContainerProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineListModalContainer({
  params,
  onClose,
}: TimelineListModalContainerProps) {
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: timelines = [],
    isLoading: isTimelinesLoading,
    error: timelinesError,
  } = useListCollectionTimelinesQuery(
    collectionId != null ? { id: collectionId, include: "events" } : skipToken,
  );
  const {
    data: collection,
    isLoading: isCollectionLoading,
    error: collectionError,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  const isLoading = isTimelinesLoading || isCollectionLoading;
  const error = timelinesError ?? collectionError;

  return (
    <TimelineListModal
      loading={isLoading}
      error={error}
      onClose={onClose}
      collection={collection}
      timelines={timelines}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListModalContainer;
