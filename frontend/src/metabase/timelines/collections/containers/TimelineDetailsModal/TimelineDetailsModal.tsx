import _ from "underscore";

import { TimelineEvents } from "metabase/entities/timeline-events";
import { Timelines } from "metabase/entities/timelines";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import { navigateToPath } from "../../navigation";
import type { ModalParams } from "../../types";

interface TimelineDetailsModalProps {
  params: ModalParams;
  timelines: Timeline[];
}

const timelineProps = {
  id: (state: State, { params }: TimelineDetailsModalProps) =>
    Urls.extractEntityId(params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const timelinesProps = {
  query: (state: State, { params }: TimelineDetailsModalProps) => ({
    collectionId: Urls.extractCollectionId(params.slug),
    include: "events",
  }),
  LoadingAndErrorWrapper,
};

const mapStateToProps = (state: State, props: TimelineDetailsModalProps) => ({
  isOnlyTimeline: props.timelines.length <= 1,
});

const mapDispatchToProps = (dispatch: any) => ({
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
  onGoBack: (timeline: Timeline) => {
    navigateToPath(Urls.timelinesInCollection(timeline.collection));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  Timelines.loadList(timelinesProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineDetailsModal);
