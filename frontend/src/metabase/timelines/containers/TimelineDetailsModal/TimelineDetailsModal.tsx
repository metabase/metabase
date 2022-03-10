import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalProps } from "../../types";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = (dispatch: any) => ({
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
  onGoBack: (collection: Collection) => {
    dispatch(push(Urls.timelinesInCollection(collection)));
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(TimelineDetailsModal);
