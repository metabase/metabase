import { connect } from "react-redux";
import _ from "underscore";
import TimelineEvents from "metabase/entities/timeline-events";
import { TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import EditEventModal from "../../components/EditEventModal";

export interface EditEventModalProps {
  eventId: number;
}

const timelineEventProps = {
  id: (state: State, props: EditEventModalProps) => props.eventId,
  entityAlias: "event",
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.update(event));
  },
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
});

export default _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(EditEventModal);
