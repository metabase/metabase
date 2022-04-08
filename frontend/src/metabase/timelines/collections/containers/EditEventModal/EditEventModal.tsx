import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import EditEventModal from "../../components/EditEventModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalProps } from "../../types";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const timelineEventProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent, timeline: Timeline) => {
    await dispatch(TimelineEvents.actions.update(event));
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onArchive: async (event: TimelineEvent, timeline: Timeline) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(EditEventModal);
