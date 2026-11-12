import {
  skipToken,
  useGetTimelineQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import TimelineDetailsContent from "../../components/TimelineDetailsContent";
import { TimelineQueryModal } from "../../components/TimelineQueryModal";
import type { ModalParams } from "../../types";
import { getTimelineDetailsHeaderProps } from "../../utils/timeline-details-header";

interface TimelineDetailsModalProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineDetailsModal({ params, onClose }: TimelineDetailsModalProps) {
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
    <TimelineQueryModal
      data={timeline}
      isLoading={isLoading}
      error={error}
      getHeaderProps={(timeline) =>
        getTimelineDetailsHeaderProps(timeline, {
          isOnlyTimeline: timelines.length <= 1,
          onGoBack: handleGoBack,
        })
      }
      onClose={onClose}
    >
      {(timeline) => (
        <TimelineDetailsContent timeline={timeline} onArchive={handleArchive} />
      )}
    </TimelineQueryModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineDetailsModal;
