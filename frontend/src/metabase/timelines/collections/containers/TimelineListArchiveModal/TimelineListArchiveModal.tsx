import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Collection, Timeline } from "metabase-types/api";

import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListArchiveModalContainerProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineListArchiveModalContainer({
  params,
  onClose,
}: TimelineListArchiveModalContainerProps) {
  const navigate = useNavigate();
  const archive = useSetArchive();
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: timelines = [],
    isLoading: isTimelinesLoading,
    error: timelinesError,
  } = useListCollectionTimelinesQuery(
    collectionId != null
      ? { id: collectionId, include: "events", archived: true }
      : skipToken,
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

  const onUnarchive = (timeline: Timeline) =>
    archive({ id: timeline.id, model: "timeline" }, false);

  const onGoBack = (collection: Collection) => {
    navigate(Urls.timelinesInCollection(collection));
  };

  return (
    <TimelineListModal
      loading={isLoading}
      error={error}
      onClose={onClose}
      collection={collection}
      timelines={timelines}
      isArchive
      onUnarchive={onUnarchive}
      onGoBack={onGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListArchiveModalContainer;
