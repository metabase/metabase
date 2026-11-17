import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import * as Urls from "metabase/urls";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import TimelineDetailsContent from "../../components/TimelineDetailsContent";
import TimelineListContent from "../../components/TimelineListContent";
import { TimelineQueryModal } from "../../components/TimelineQueryModal";
import type { ModalParams } from "../../types";
import { getTimelineDetailsHeaderProps } from "../../utils/timeline-details-header";
import { getTimelineListHeaderProps } from "../../utils/timeline-list-header";

interface TimelineIndexModalProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineIndexModal({ params, onClose }: TimelineIndexModalProps) {
  const archive = useSetArchive();
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

  const handleArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);

  return (
    <TimelineQueryModal
      data={collection}
      isLoading={isLoading}
      error={error}
      getHeaderProps={(collection) => getHeaderProps(timelines, collection)}
      onClose={onClose}
    >
      {(collection) => (
        <TimelineIndexContent
          timelines={timelines}
          collection={collection}
          onArchive={handleArchive}
        />
      )}
    </TimelineQueryModal>
  );
}

const getOnlyTimeline = (timelines: Timeline[]) =>
  timelines.length === 1 ? timelines[0] : undefined;

const getHeaderProps = (timelines: Timeline[], collection: Collection) => {
  const onlyTimeline = getOnlyTimeline(timelines);

  return onlyTimeline
    ? getTimelineDetailsHeaderProps(onlyTimeline, { isOnlyTimeline: true })
    : getTimelineListHeaderProps(timelines, collection);
};

interface TimelineIndexContentProps {
  timelines: Timeline[];
  collection: Collection;
  onArchive: (event: TimelineEvent) => void;
}

const TimelineIndexContent = ({
  timelines,
  collection,
  onArchive,
}: TimelineIndexContentProps) => {
  const onlyTimeline = getOnlyTimeline(timelines);

  return onlyTimeline ? (
    <TimelineDetailsContent timeline={onlyTimeline} onArchive={onArchive} />
  ) : (
    <TimelineListContent timelines={timelines} collection={collection} />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineIndexModal;
