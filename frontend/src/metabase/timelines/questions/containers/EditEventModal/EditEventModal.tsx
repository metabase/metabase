import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import TimelineEvents from "metabase/entities/timeline-events";
import { addUndo } from "metabase/redux/undo";
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
    dispatch(addUndo({ message: t`Updated event` }));
  },
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
});

export default _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(EditEventModal);
