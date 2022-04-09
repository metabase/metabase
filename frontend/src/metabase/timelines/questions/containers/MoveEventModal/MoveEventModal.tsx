import { connect } from "react-redux";
import _ from "underscore";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import MoveEventModal from "metabase/timelines/common/components/MoveEventModal";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";

interface ModalProps {
  eventId: number;
  onClose?: () => void;
}

const timelinesProps = {
  query: { include: "events" },
};

const timelineEventProps = {
  id: (state: State, props: ModalProps) => props.eventId,
  entityAlias: "event",
};

const mapStateToProps = (state: State, { onClose }: ModalProps) => ({
  onSubmitSuccess: onClose,
  onCancel: onClose,
});

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (
    event: TimelineEvent,
    newTimeline: Timeline,
    oldTimeline: Timeline,
    onClose?: () => void,
  ) => {
    await dispatch(TimelineEvents.actions.setTimeline(event, newTimeline));
    onClose?.();
  },
});

export default _.compose(
  Timelines.loadList(timelinesProps),
  TimelineEvents.load(timelineEventProps),
  connect(mapStateToProps, mapDispatchToProps),
)(MoveEventModal);
