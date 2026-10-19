import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import * as Urls from "metabase/urls";

import { LoadingAndErrorModal } from "../../components/LoadingAndErrorModal";
import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListModalContainerProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineListModalContainer({
  params,
  onClose,
  ...props
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
    <TimelineListModal
      {...props}
      onClose={onClose}
      collection={collection}
      timelines={timelines}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListModalContainer;
