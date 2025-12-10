import { t } from "ttag";
import _ from "underscore";

import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import TimelineEvents from "metabase/entities/timeline-events";
import Timelines from "metabase/entities/timelines";
import { useToast } from "metabase/common/hooks/use-toast";
import { connect } from "metabase/lib/redux";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import type { Collection, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface NewEventModalProps {
  cardId?: number;
  collectionId?: number;
  onClose?: () => void;
  onSubmit?: (values: Partial<TimelineEvent>, collection: Collection) => Promise<void>;
}

const timelineProps = {
  query: { include: "events" },
};

const collectionProps = {
  id: (state: State, props: NewEventModalProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

const mapStateToProps = (state: State, { onClose }: NewEventModalProps) => ({
  source: "question",
  onSubmitSuccess: onClose,
  onCancel: onClose,
});

const mapDispatchToProps = (dispatch: any, ownProps: NewEventModalProps) => ({
  onSubmit: async (values: Partial<TimelineEvent>, collection: Collection) => {
    if (values.timeline_id) {
      await dispatch(TimelineEvents.actions.create(values));
    } else {
      await dispatch(Timelines.actions.createWithEvent(values, collection));
    }

    // Call the wrapper's onSubmit if provided
    if (ownProps.onSubmit) {
      await ownProps.onSubmit(values, collection);
    }
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
  
  // Handle the onSubmit to show toast
  const handleSubmit = async (values: Partial<TimelineEvent>, collection: Collection) => {
    sendToast({ message: t`Created event` });
  };

  return <ConnectedNewEventModal {...props} onSubmit={handleSubmit} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventModalWrapper;
