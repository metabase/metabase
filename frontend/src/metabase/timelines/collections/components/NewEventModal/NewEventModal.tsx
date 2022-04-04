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
  timeline?: Timeline;
  collection: Collection;
  onSubmit: (
    values: Partial<TimelineEvent>,
    collection: Collection,
    timeline?: Timeline,
  ) => void;
  onCancel: (location: string) => void;
  onClose?: () => void;
}

const NewEventModal = ({
  timeline,
  collection,
  onSubmit,
  onCancel,
  onClose,
}: NewEventModalProps): JSX.Element => {
  const form = useMemo(() => forms.details(), []);

  const initialValues = useMemo(
    () => ({
      timeline_id: timeline?.id,
      icon: timeline ? timeline.icon : getDefaultTimelineIcon(),
      timezone: getDefaultTimezone(),
      source: "collections",
    }),
    [timeline],
  );

  const handleSubmit = useCallback(
    async (values: Partial<TimelineEvent>) => {
      await onSubmit(values, collection, timeline);
    },
    [timeline, collection, onSubmit],
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
