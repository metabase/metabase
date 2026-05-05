import type { ComponentProps } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { skipToken, useGetTimelineQuery } from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import { Timelines } from "metabase/entities/timelines";
import { connect, useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import type { ModalParams } from "../../types";

interface TimelineDetailsModalProps {
  params: ModalParams;
  timelines: Timeline[];
  onClose?: () => void;
}

const timelinesProps = {
  query: (state: State, props: TimelineDetailsModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    include: "events",
  }),
  LoadingAndErrorWrapper,
};

const mapStateToProps = (state: State, props: TimelineDetailsModalProps) => ({
  isOnlyTimeline: props.timelines.length <= 1,
});

function TimelineDetailsModalContainer({
  params,
  timelines,
  isOnlyTimeline,
  ...props
}: TimelineDetailsModalProps & {
  isOnlyTimeline: boolean;
} & Partial<ComponentProps<typeof TimelineDetailsModal>>) {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const id = Urls.extractEntityId(params.timelineId);
  const {
    data: timeline,
    isLoading,
    error,
  } = useGetTimelineQuery(id != null ? { id, include: "events" } : skipToken);

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
      isOnlyTimeline={isOnlyTimeline}
      onArchive={handleArchive}
      onGoBack={handleGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelinesProps),
  connect(mapStateToProps),
)(TimelineDetailsModalContainer);
