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
  EmptyStateBody,
  EmptyStateRoot,
  EmptyStateText,
  ListRoot,
} from "./TimelineListModal.styled";
import Button from "metabase/core/components/Button";

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
      {timelines.length ? (
        <TimelineList timelines={timelines} />
      ) : (
        <TimelineEmptyState />
      )}
    </ActionModal>
  );
};

interface TimelineListProps {
  timelines: EventTimeline[];
}

const TimelineList = ({ timelines }: TimelineListProps): JSX.Element => {
  return (
    <ListRoot>
      {timelines.map(timeline => (
        <TimelineCard key={timeline.id} timeline={timeline} />
      ))}
    </ListRoot>
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

const TimelineEmptyState = (): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateBody>
        <EmptyStateText>
          {t`Add events to Metabase to show important milestones, launches, or anything else, right alongside your data.`}
        </EmptyStateText>
        <Button primary>{t`Add an event`}</Button>
      </EmptyStateBody>
    </EmptyStateRoot>
  );
};

export default TimelineListModal;
