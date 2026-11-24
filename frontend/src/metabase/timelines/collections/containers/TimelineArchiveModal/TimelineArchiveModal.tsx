import { t } from "ttag";

import { skipToken, useGetTimelineQuery } from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import TimelineDetailsContent from "../../components/TimelineDetailsContent";
import { TimelineQueryModal } from "../../components/TimelineQueryModal";
import { getTimelineDetailsHeaderProps } from "../../utils/timeline-details-header";

function TimelineArchiveModal({ params, onClose }: ModalComponentProps) {
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

  const handleUnarchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, false);

  const handleGoBack = (timeline: Timeline) => {
    navigate(Urls.timelineInCollection(timeline));
  };

  return (
    <TimelineQueryModal
      data={timeline}
      isLoading={isLoading}
      error={error}
      loadingTitle={t`Archived events`}
      getHeaderProps={(timeline) =>
        getTimelineDetailsHeaderProps(timeline, {
          isArchive: true,
          onGoBack: handleGoBack,
        })
      }
      onClose={onClose}
    >
      {(timeline) => (
        <TimelineDetailsContent
          timeline={timeline}
          isArchive
          onUnarchive={handleUnarchive}
        />
      )}
    </TimelineQueryModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineArchiveModal;
