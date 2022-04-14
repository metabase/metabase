import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { getDefaultTimezone } from "metabase/lib/time";
import { getDefaultTimelineIcon } from "metabase/lib/timelines";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import {
  Collection,
  Timeline,
  TimelineEvent,
  TimelineEventSource,
} from "metabase-types/api";
import ModalBody from "../ModalBody";
import ModalHeader from "../ModalHeader";

export interface NewEventModalProps {
  timelines?: Timeline[];
  collection?: Collection;
  cardId?: number;
  source: TimelineEventSource;
  onSubmit: (
    values: Partial<TimelineEvent>,
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
  cardId,
  source,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: NewEventModalProps): JSX.Element => {
  const availableTimelines = useMemo(() => {
    return timelines.filter(t => t.collection?.can_write);
  }, [timelines]);

  const form = useMemo(() => {
    return forms.details({ timelines: availableTimelines });
  }, [availableTimelines]);

  const initialValues = useMemo(() => {
    const defaultTimeline = availableTimelines[0];
    const hasOneTimeline = availableTimelines.length === 1;

    return {
      timeline_id: defaultTimeline ? defaultTimeline.id : null,
      icon: hasOneTimeline ? defaultTimeline.icon : getDefaultTimelineIcon(),
      timezone: getDefaultTimezone(),
      source,
      question_id: cardId,
      time_matters: false,
    };
  }, [cardId, source, availableTimelines]);

  const handleSubmit = useCallback(
    async (values: Partial<TimelineEvent>) => {
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
        <Form
          form={form}
          initialValues={initialValues}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onCancel}
        />
      </ModalBody>
    </div>
  );
};

export default NewEventModal;
