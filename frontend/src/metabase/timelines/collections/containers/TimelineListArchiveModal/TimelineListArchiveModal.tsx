import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Collection, Timeline } from "metabase-types/api";

import TimelineListContent from "../../components/TimelineListContent";
import { TimelineQueryModal } from "../../components/TimelineQueryModal";
import type { ModalParams } from "../../types";
import { getTimelineListHeaderProps } from "../../utils/timeline-list-header";

interface TimelineListArchiveModalProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineListArchiveModal({
  params,
  onClose,
}: TimelineListArchiveModalProps) {
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
    <TimelineQueryModal
      data={collection}
      isLoading={isLoading}
      error={error}
      getHeaderProps={(collection) =>
        getTimelineListHeaderProps(timelines, collection, {
          isArchive: true,
          onGoBack,
        })
      }
      onClose={onClose}
    >
      {(collection) => (
        <TimelineListContent
          timelines={timelines}
          collection={collection}
          isArchive
          onUnarchive={onUnarchive}
        />
      )}
    </TimelineQueryModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListArchiveModal;
