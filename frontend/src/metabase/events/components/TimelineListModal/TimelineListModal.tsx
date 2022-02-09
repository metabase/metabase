import React from "react";
import { msgid, ngettext, t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";
import { Collection, EventTimeline } from "metabase-types/api";
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

export interface TimelineListModalProps {
  collection: Collection;
  timelines: EventTimeline[];
  onClose?: () => void;
}

const TimelineListModal = ({
  collection,
  timelines,
  onClose,
}: TimelineListModalProps): JSX.Element => {
  const hasItems = timelines.length > 0;

  return (
    <ModalContent title={t`Events`} onClose={onClose}>
      {hasItems ? (
        <TimelineList timelines={timelines} />
      ) : (
        <TimelineEmptyState collection={collection} />
      )}
    </ModalContent>
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

export interface TimelineEmptyStateProps {
  collection: Collection;
}

const TimelineEmptyState = ({
  collection,
}: TimelineEmptyStateProps): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateBody>
        <EmptyStateText>
          {t`Add events to Metabase to show important milestones, launches, or anything else, right alongside your data.`}
        </EmptyStateText>
        <Link
          className="Button Button--primary"
          to={Urls.newTimelineAndEvent(collection)}
        >
          {t`Add an event`}
        </Link>
      </EmptyStateBody>
    </EmptyStateRoot>
  );
};

export default TimelineListModal;
