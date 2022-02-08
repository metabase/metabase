import React from "react";
import { t } from "ttag";
import ActionModal from "../ActionModal";
import { EventTimeline } from "metabase-types/api";
import {
  CardBody,
  CardDescription,
  CardIcon,
  CardRoot,
  CardTitle,
  ModalBody,
} from "./TimelineListModal.styled";

export interface TimelineListModalProps {
  timelines: EventTimeline[];
  onClose?: () => void;
}

const TimelineListModal = ({
  timelines,
  onClose,
}: TimelineListModalProps): JSX.Element => {
  return (
    <ActionModal title={t`Events`} onClose={onClose}>
      <ModalBody>
        {timelines.map(timeline => (
          <TimelineCard key={timeline.id} timeline={timeline} />
        ))}
      </ModalBody>
    </ActionModal>
  );
};

interface TimelineCardProps {
  timeline: EventTimeline;
}

const TimelineCard = ({ timeline }: TimelineCardProps): JSX.Element => {
  return (
    <CardRoot to="">
      <CardIcon name={timeline.default_icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
    </CardRoot>
  );
};

export default TimelineListModal;
