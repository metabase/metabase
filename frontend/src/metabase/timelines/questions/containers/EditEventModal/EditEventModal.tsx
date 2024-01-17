import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import TimelineEvents from "metabase/entities/timeline-events";
import { addUndo } from "metabase/redux/undo";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import type { TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface EditEventModalProps {
  eventId: number;
  onClose?: () => void;
}

const timelineEventProps = {
  id: (state: State, props: EditEventModalProps) => props.eventId,
  entityAlias: "event",
};

const mapStateToProps = (state: State, { onClose }: EditEventModalProps) => ({
  onSubmitSuccess: onClose,
  onArchiveSuccess: onClose,
  onCancel: onClose,
});

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.update(event));
    dispatch(addUndo({ message: t`Updated event` }));
  },
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(mapStateToProps, mapDispatchToProps),
)(EditEventModal);
