import { t } from "ttag";
import _ from "underscore";

import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import TimelineEvents from "metabase/entities/timeline-events";
import Timelines from "metabase/entities/timelines";
import { useToast, type ToastArgs } from "metabase/common/hooks/use-toast";
import { connect } from "metabase/lib/redux";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import type { Collection, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface NewEventModalProps {
  cardId?: number;
  collectionId?: number;
  onClose?: () => void;
}

interface NewEventModalInternalProps extends NewEventModalProps {
  sendToast: (args: ToastArgs) => void;
}

const timelineProps = {
  query: { include: "events" },
};

const collectionProps = {
  id: (state: State, props: NewEventModalInternalProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

const mapStateToProps = (state: State, { onClose }: NewEventModalInternalProps) => ({
  source: "question",
  onSubmitSuccess: onClose,
  onCancel: onClose,
});

const mapDispatchToProps = (dispatch: any, ownProps: NewEventModalInternalProps) => ({
  onSubmit: async (values: Partial<TimelineEvent>, collection: Collection) => {
    if (values.timeline_id) {
      await dispatch(TimelineEvents.actions.create(values));
    } else {
      await dispatch(Timelines.actions.createWithEvent(values, collection));
    }

    ownProps.sendToast({ message: t`Created event` });
  },
});

const ConnectedNewEventModal = _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(NewEventModal);

// Wrapper component to use the useToast hook
const NewEventModalWrapper = (props: NewEventModalProps) => {
  const [sendToast] = useToast();

  return <ConnectedNewEventModal {...props} sendToast={sendToast} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventModalWrapper;
