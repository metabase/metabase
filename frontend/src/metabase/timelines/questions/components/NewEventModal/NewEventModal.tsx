import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { getDefaultTimezone } from "metabase/lib/time";
import { getDefaultTimelineIcon } from "metabase/lib/timelines";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { ModalBody } from "./NewEventModal.styled";

export interface NewEventModalProps {
  timelines: Timeline[];
  onSubmit: (values: Partial<TimelineEvent>) => void;
  onClose?: () => void;
}

const NewEventModal = ({
  timelines,
  onSubmit,
  onClose,
}: NewEventModalProps): JSX.Element => {
  const form = useMemo(() => forms.details({ timelines }), [timelines]);
  const hasTimelines = timelines.length > 0;
  const hasOneTimeline = timelines.length === 1;
  const defaultTimeline = timelines[0];

  const initialValues = useMemo(
    () => ({
      timeline_id: hasTimelines ? defaultTimeline.id : null,
      icon: hasOneTimeline ? defaultTimeline.icon : getDefaultTimelineIcon(),
      timezone: getDefaultTimezone(),
    }),
    [defaultTimeline, hasTimelines, hasOneTimeline],
  );

  const handleSubmit = useCallback(
    async (values: Partial<TimelineEvent>) => {
      await onSubmit(values);
      onClose?.();
    },
    [onSubmit, onClose],
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
