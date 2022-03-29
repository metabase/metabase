import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { getDefaultTimezone } from "metabase/lib/time";
import { getDefaultTimelineIcon } from "metabase/lib/timelines";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { ModalBody } from "./NewEventModal.styled";

export interface NewEventModalProps {
  cardId?: number;
  timelines?: Timeline[];
  collection: Collection;
  onSubmit: (values: Partial<TimelineEvent>, collection: Collection) => void;
  onClose?: () => void;
}

const NewEventModal = ({
  cardId,
  timelines = [],
  collection,
  onSubmit,
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
      source: "question",
      question_id: cardId,
    };
  }, [cardId, availableTimelines]);

  const handleSubmit = useCallback(
    async (values: Partial<TimelineEvent>) => {
      await onSubmit(values, collection);
      onClose?.();
    },
    [collection, onSubmit, onClose],
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
          onClose={onClose}
        />
      </ModalBody>
    </div>
  );
};

export default NewEventModal;
