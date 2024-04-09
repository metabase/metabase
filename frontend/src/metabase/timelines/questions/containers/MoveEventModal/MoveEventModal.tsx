import { connect } from "react-redux";
import _ from "underscore";

import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import TimelineEvents from "metabase/entities/timeline-events";
import Timelines from "metabase/entities/timelines";
import MoveEventModal from "metabase/timelines/common/components/MoveEventModal";
import type { Timeline, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface MoveEventModalProps {
  eventId: number;
  collectionId?: number;
  onClose?: () => void;
}

const timelinesProps = {
  query: { include: "events" },
};

const timelineEventProps = {
  id: (state: State, props: MoveEventModalProps) => props.eventId,
  entityAlias: "event",
};

const collectionProps = {
  id: (state: State, props: MoveEventModalProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

const mapStateToProps = (state: State, { onClose }: MoveEventModalProps) => ({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelinesProps),
  TimelineEvents.load(timelineEventProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(MoveEventModal);
