import type { ComponentProps } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { useSetArchive } from "metabase/common/hooks";
import { Timelines } from "metabase/entities/timelines";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import type { ModalParams } from "../../types";

interface TimelineDetailsModalProps {
  params: ModalParams;
  timelines: Timeline[];
}

const timelineProps = {
  id: (state: State, props: TimelineDetailsModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

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

const mapDispatchToProps = (dispatch: any) => ({
  onGoBack: (timeline: Timeline) => {
    dispatch(push(Urls.timelinesInCollection(timeline.collection)));
  },
});

function TimelineDetailsModalContainer(
  props: ComponentProps<typeof TimelineDetailsModal>,
) {
  const archive = useSetArchive();
  const onArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);
  return <TimelineDetailsModal {...props} onArchive={onArchive} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  Timelines.loadList(timelinesProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineDetailsModalContainer);
