import {
  skipToken,
  useGetTimelineQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import type { ModalParams } from "../../types";

interface TimelineDetailsModalContainerProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineDetailsModalContainer({
  params,
  onClose,
}: TimelineDetailsModalContainerProps) {
  const navigate = useNavigate();
  const archive = useSetArchive();
  const id = Urls.extractEntityId(params.timelineId);
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: timeline,
    isLoading: isTimelineLoading,
    error: timelineError,
  } = useGetTimelineQuery(id != null ? { id, include: "events" } : skipToken);
  const {
    data: timelines = [],
    isLoading: isTimelinesLoading,
    error: timelinesError,
  } = useListCollectionTimelinesQuery(
    collectionId != null ? { id: collectionId, include: "events" } : skipToken,
  );

  const isLoading = isTimelineLoading || isTimelinesLoading;
  const error = timelineError ?? timelinesError;

  const handleArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);

  const handleGoBack = (timeline: Timeline) => {
    navigate(Urls.timelinesInCollection(timeline.collection));
  };

  return (
    <TimelineDetailsModal
      loading={isLoading}
      error={error}
      onClose={onClose}
      timeline={timeline}
      isOnlyTimeline={timelines.length <= 1}
      onArchive={handleArchive}
      onGoBack={handleGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineDetailsModalContainer;
