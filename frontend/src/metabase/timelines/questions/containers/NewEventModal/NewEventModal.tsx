import { t } from "ttag";
import _ from "underscore";

import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import { TimelineEvents } from "metabase/entities/timeline-events";
import { Timelines } from "metabase/entities/timelines";
import type { State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import { connect } from "metabase/utils/redux";
import type { Collection, TimelineEvent } from "metabase-types/api";

interface NewEventModalProps {
  cardId?: number;
  collectionId?: number;
  onClose?: () => void;
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

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (values: Partial<TimelineEvent>, collection: Collection) => {
    if (values.timeline_id) {
      await dispatch(TimelineEvents.actions.create(values));
    } else {
      await dispatch(Timelines.actions.createWithEvent(values, collection));
    }

    dispatch(addUndo({ message: t`Created event` }));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(NewEventModal);
