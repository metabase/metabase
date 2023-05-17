import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import DeleteEventModal from "metabase/timelines/common/components/DeleteEventModal";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import { ModalParams } from "../../types";

interface DeleteEventModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, props: DeleteEventModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
};

const timelineEventProps = {
  id: (state: State, props: DeleteEventModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent, timeline: Timeline) => {
    await dispatch(TimelineEvents.actions.delete(event));
    dispatch(push(Urls.timelineArchiveInCollection(timeline)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(DeleteEventModal);
