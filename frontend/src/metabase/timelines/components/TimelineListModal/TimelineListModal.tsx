import React from "react";
import { t } from "ttag";
import EntityMenu from "metabase/components/EntityMenu";
import { Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import TimelineCard from "../TimelineCard";
import {
  EmptyStateBody,
  EmptyStateRoot,
  EmptyStateText,
  ListRoot,
  ModalBody,
} from "./TimelineListModal.styled";
import Button from "metabase/core/components/Button";

export interface TimelineListModalProps {
  timelines: Timeline[];
  onClose?: () => void;
  onCreateEvent?: () => void;
  onCreateTimeline?: () => void;
}

const TimelineListModal = ({
  timelines,
  onClose,
  onCreateEvent,
  onCreateTimeline,
}: TimelineListModalProps): JSX.Element => {
  const hasItems = timelines.length > 0;

  return (
    <div>
      <ModalHeader title={t`Events`} onClose={onClose}>
        <TimelineMenu onCreateTimeline={onCreateTimeline} />
      </ModalHeader>
      <ModalBody>
        {hasItems ? (
          <TimelineList timelines={timelines} />
        ) : (
          <TimelineEmptyState onCreateEvent={onCreateEvent} />
        )}
      </ModalBody>
    </div>
  );
};

interface TimelineListProps {
  timelines: Timeline[];
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

export interface TimelineMenuProps {
  onCreateTimeline?: () => void;
}

const TimelineMenu = ({ onCreateTimeline }: TimelineMenuProps): JSX.Element => {
  const items = [
    {
      title: t`New timeline`,
      action: onCreateTimeline,
    },
  ];

  return <EntityMenu items={items} triggerIcon="ellipsis" />;
};

export interface TimelineEmptyStateProps {
  onCreateEvent?: () => void;
}

const TimelineEmptyState = ({
  onCreateEvent,
}: TimelineEmptyStateProps): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateBody>
        <EmptyStateText>
          {t`Add events to Metabase to show important milestones, launches, or anything else, right alongside your data.`}
        </EmptyStateText>
        <Button primary onClick={onCreateEvent}>
          {t`Add an event`}
        </Button>
      </EmptyStateBody>
    </EmptyStateRoot>
  );
};

export default TimelineListModal;
