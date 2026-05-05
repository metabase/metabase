import type { ComponentProps } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useSetArchive } from "metabase/common/hooks";
import { TimelineEvents } from "metabase/entities/timeline-events";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import type { TimelineEvent } from "metabase-types/api";

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
});

function EditEventModalContainer(props: ComponentProps<typeof EditEventModal>) {
  const archive = useSetArchive();
  const onArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);
  return <EditEventModal {...props} onArchive={onArchive} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(mapStateToProps, mapDispatchToProps),
)(EditEventModalContainer);
