import { t } from "ttag";
import _ from "underscore";

import TimelineEvents from "metabase/entities/timeline-events";
import { useToast, type ToastArgs } from "metabase/common/hooks/use-toast";
import { connect } from "metabase/lib/redux";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import type { TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface EditEventModalProps {
  eventId: number;
  onClose?: () => void;
}

interface EditEventModalInternalProps extends EditEventModalProps {
  sendToast: (args: ToastArgs) => void;
}

const timelineEventProps = {
  id: (state: State, props: EditEventModalInternalProps) => props.eventId,
  entityAlias: "event",
};

const mapStateToProps = (state: State, { onClose }: EditEventModalInternalProps) => ({
  onSubmitSuccess: onClose,
  onArchiveSuccess: onClose,
  onCancel: onClose,
});

const mapDispatchToProps = (dispatch: any, ownProps: EditEventModalInternalProps) => ({
  onSubmit: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.update(event));
    ownProps.sendToast({ message: t`Updated event` });
  },
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
  },
});

const ConnectedEditEventModal = _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(mapStateToProps, mapDispatchToProps),
)(EditEventModal);

// Wrapper component to use the useToast hook
const EditEventModalWrapper = (props: EditEventModalProps) => {
  const [sendToast] = useToast();

  return <ConnectedEditEventModal {...props} sendToast={sendToast} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModalWrapper;
