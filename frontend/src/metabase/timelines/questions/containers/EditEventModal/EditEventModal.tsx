import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import TimelineEvents from "metabase/entities/timeline-events";
import { addUndo } from "metabase/redux/undo";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";

interface ModalProps {
  eventId: number;
  onClose?: () => void;
}

const timelineEventProps = {
  id: (state: State, props: ModalProps) => props.eventId,
  entityAlias: "event",
};

const mapStateToProps = (state: State, { onClose }: ModalProps) => ({
  onSubmitSuccess: onClose,
  onArchiveSuccess: onClose,
  onCancel: onClose,
});

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent, timeline?: Timeline) => {
    await dispatch(TimelineEvents.actions.update(event));
    dispatch(addUndo({ message: t`Updated event` }));
  },
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
});

export default _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(mapStateToProps, mapDispatchToProps),
)(EditEventModal);
