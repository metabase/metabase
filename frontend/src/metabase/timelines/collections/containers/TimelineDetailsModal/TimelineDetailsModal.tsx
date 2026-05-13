import { push } from "react-router-redux";

import {
  skipToken,
  useGetTimelineQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import type { ModalParams } from "../../types";

interface TimelineDetailsModalContainerProps {
  params: ModalParams;
  onClose?: () => void;
}

function TimelineDetailsModalContainer({
  params,
  ...props
}: TimelineDetailsModalContainerProps) {
  const dispatch = useDispatch();
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

  if (isLoading || error || !timeline) {
    return (
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper />
    );
  }

  const handleArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);

  const handleGoBack = (timeline: Timeline) => {
    dispatch(push(Urls.timelinesInCollection(timeline.collection)));
  };

  return (
    <TimelineDetailsModal
      {...props}
      timeline={timeline}
      isOnlyTimeline={timelines.length <= 1}
      onArchive={handleArchive}
      onGoBack={handleGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineDetailsModalContainer;
