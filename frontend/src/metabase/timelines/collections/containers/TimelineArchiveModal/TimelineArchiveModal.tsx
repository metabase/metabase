import { skipToken, useGetTimelineQuery } from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import { LoadingAndErrorModal } from "../../components/LoadingAndErrorModal";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";

function TimelineArchiveModalContainer({
  params,
  onClose,
}: ModalComponentProps) {
  const navigate = useNavigate();
  const archive = useSetArchive();
  const id = Urls.extractEntityId(params.timelineId);
  const {
    data: timeline,
    isLoading,
    error,
  } = useGetTimelineQuery(
    id != null ? { id, include: "events", archived: true } : skipToken,
  );

  if (isLoading || error || !timeline) {
    return (
      <LoadingAndErrorModal
        loading={isLoading}
        error={error}
        onClose={onClose}
      />
    );
  }

  const handleUnarchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, false);

  const handleGoBack = (timeline: Timeline) => {
    navigate(Urls.timelineInCollection(timeline));
  };

  return (
    <TimelineDetailsModal
      onClose={onClose}
      timeline={timeline}
      isArchive
      onUnarchive={handleUnarchive}
      onGoBack={handleGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineArchiveModalContainer;
