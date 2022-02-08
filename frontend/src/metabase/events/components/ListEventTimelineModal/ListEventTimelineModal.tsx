import React from "react";
import { t } from "ttag";
import ActionModal from "../ActionModal";
import { EventTimeline } from "metabase-types/api";
import EventTimelineCard from "../EventTimelineCard";
import { ModalBody } from "./ListEventTimelineModal.styled";

export interface ListEventTimelineModalProps {
  timelines: EventTimeline[];
  onClose?: () => void;
}

const ListEventTimelineModal = ({
  timelines,
  onClose,
}: ListEventTimelineModalProps): JSX.Element => {
  return (
    <ActionModal title={t`Events`} onClose={onClose}>
      <ModalBody>
        {timelines.map(timeline => (
          <EventTimelineCard key={timeline.id} timeline={timeline} />
        ))}
      </ModalBody>
    </ActionModal>
  );
};

export default ListEventTimelineModal;
