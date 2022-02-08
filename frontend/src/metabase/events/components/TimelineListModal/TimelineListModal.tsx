import React from "react";
import { msgid, ngettext, t } from "ttag";
import { EventTimeline } from "metabase-types/api";
import ActionModal from "../ActionModal";
import {
  CardBody,
  CardDescription,
  CardIcon,
  CardInfo,
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
  const events = timeline.events.length;

  return (
    <CardRoot to="">
      <CardIcon name={timeline.default_icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
      <CardInfo>
        {ngettext(msgid`${events} event`, `${events} events`, events)}
      </CardInfo>
    </CardRoot>
  );
};

export default TimelineListModal;
