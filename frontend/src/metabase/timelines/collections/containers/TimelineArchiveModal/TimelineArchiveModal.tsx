import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import TimelineEvents from "metabase/entities/timeline-events";
import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import type { ModalParams } from "../../types";

interface TimelineArchiveModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, props: TimelineArchiveModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events", archived: true },
  LoadingAndErrorWrapper,
};

const mapStateToProps = () => ({
  isArchive: true,
});

const mapDispatchToProps = (dispatch: any) => ({
  onUnarchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, false));
  },
  onGoBack: (timeline: Timeline) => {
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineDetailsModal);
