import React from "react";
import { msgid, ngettext, t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Button from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, EventTimeline } from "metabase-types/api";
import MenuModal from "../MenuModal";
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
  const hasTimelines = timelines.length > 0;

  return (
    <MenuModal
      title={t`Events`}
      menu={hasTimelines && <TimelineMenu collection={collection} />}
      onClose={onClose}
    >
      {hasTimelines ? (
        <TimelineList timelines={timelines} />
      ) : (
        <TimelineEmptyState />
      )}
    </MenuModal>
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

export interface TimelineMenuProps {
  collection: Collection;
}

const TimelineMenu = ({ collection }: TimelineMenuProps): JSX.Element => {
  const items = [
    {
      title: t`New timeline`,
      link: Urls.newTimeline(collection),
    },
  ];

  return <EntityMenu items={items} triggerIcon="ellipsis" />;
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
