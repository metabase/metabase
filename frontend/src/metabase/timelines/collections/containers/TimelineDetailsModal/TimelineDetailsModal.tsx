import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalParams } from "../../types";

interface ModalProps {
  params: ModalParams;
  timelines: Timeline[];
}

const timelinesProps = {
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

const mapStateToProps = (state: State, { timelines, params }: ModalProps) => {
  const timelineId = Urls.extractEntityId(params.timelineId);

  return {
    timeline: timelines.find(t => t.id === timelineId),
    isOnlyTimeline: timelines.length === 1,
  };
};

const mapDispatchToProps = (dispatch: any) => ({
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
  onGoBack: (timeline: Timeline, collection: Collection) => {
    dispatch(push(Urls.timelinesInCollection(collection)));
  },
});

export default _.compose(
  Timelines.loadList(timelinesProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineDetailsModal);
