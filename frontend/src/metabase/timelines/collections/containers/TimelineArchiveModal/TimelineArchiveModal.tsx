import { push } from "react-router-redux";

import { skipToken, useGetTimelineQuery } from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";

function TimelineArchiveModalContainer({
  params,
  ...props
}: ModalComponentProps) {
  const dispatch = useDispatch();
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
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper />
    );
  }

  const handleUnarchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, false);

  const handleGoBack = (timeline: Timeline) => {
    dispatch(push(Urls.timelineInCollection(timeline)));
  };

  return (
    <TimelineDetailsModal
      {...props}
      timeline={timeline}
      isArchive
      onUnarchive={handleUnarchive}
      onGoBack={handleGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineArchiveModalContainer;
