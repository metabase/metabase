import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import EditEventModal from "../../components/EditEventModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalProps } from "../../types";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
};

const timelineEventProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (
    event: TimelineEvent,
    timeline: Timeline,
    collection: Collection,
  ) => {
    await dispatch(TimelineEvents.actions.update(event));
    dispatch(push(Urls.timelineInCollection(timeline, collection)));
  },
  onArchive: async (
    event: TimelineEvent,
    timeline: Timeline,
    collection: Collection,
  ) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
    dispatch(push(Urls.timelineInCollection(timeline, collection)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  TimelineEvents.load(timelineEventProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(EditEventModal);
