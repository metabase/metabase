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

interface TimelineArchiveModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, { params }: TimelineArchiveModalProps) =>
    Urls.extractEntityId(params.timelineId),
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
    navigateToPath(Urls.timelineInCollection(timeline));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineDetailsModal);
