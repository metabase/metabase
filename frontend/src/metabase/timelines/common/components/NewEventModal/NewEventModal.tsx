import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import moment from "moment-timezone";
import { getDefaultTimelineIcon } from "metabase/lib/timelines";
import {
  Collection,
  Timeline,
  TimelineEventData,
  TimelineEventSource,
} from "metabase-types/api";
import EventForm from "../../containers/EventForm";
import ModalBody from "../ModalBody";
import ModalHeader from "../ModalHeader";

export interface NewEventModalProps {
  timelines?: Timeline[];
  collection?: Collection;
  source: TimelineEventSource;
  cardId?: number;
  onSubmit: (
    values: TimelineEventData,
    collection?: Collection,
    timeline?: Timeline,
  ) => void;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const NewEventModal = ({
  timelines = [],
  collection,
  source,
  cardId,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: NewEventModalProps): JSX.Element => {
  const availableTimelines = useMemo(() => {
    return timelines.filter(t => t.collection?.can_write);
  }, [timelines]);

  const initialValues = useMemo(() => {
    return getInitialValues(availableTimelines, source, cardId);
  }, [availableTimelines, source, cardId]);

  const handleSubmit = useCallback(
    async (values: TimelineEventData) => {
      const timeline = timelines.find(t => t.id === values.timeline_id);
      await onSubmit(values, collection, timeline);
      onSubmitSuccess?.();
    },
    [collection, timelines, onSubmit, onSubmitSuccess],
  );

  return (
    <div>
      <ModalHeader title={t`New event`} onClose={onClose} />
      <ModalBody>
        <EventForm
          initialValues={initialValues}
          timelines={availableTimelines}
          onSubmit={handleSubmit}
          onCancel={onCancel}
        />
      </ModalBody>
    </div>
  );
};

const getInitialValues = (
  timelines: Timeline[],
  source?: TimelineEventSource,
  cardId?: number,
): TimelineEventData => {
  const defaultTimeline = timelines[0];
  const hasOneTimeline = timelines.length === 1;

  return {
    name: "",
    description: null,
    timestamp: "",
    timeline_id: defaultTimeline?.id,
    icon: hasOneTimeline ? defaultTimeline.icon : getDefaultTimelineIcon(),
    timezone: moment.tz.guess(),
    time_matters: false,
    archived: false,
    source,
    question_id: cardId,
  };
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventModal;
