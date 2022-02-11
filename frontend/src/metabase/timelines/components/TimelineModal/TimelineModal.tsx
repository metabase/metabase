import React, { useMemo } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalList, ModalToolbar } from "./TimelineModal.styled";

export interface TimelineModalProps {
  timeline: Timeline;
  collection: Collection;
  onArchive: (event: TimelineEvent) => void;
  onClose?: () => void;
}

const TimelineModal = ({
  timeline,
  collection,
  onArchive,
  onClose,
}: TimelineModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={timeline.name} onClose={onClose}>
        <TimelineMenu timeline={timeline} collection={collection} />
      </ModalHeader>
      <ModalBody>
        <TimelineToolbar timeline={timeline} collection={collection} />
        <TimelineList
          timeline={timeline}
          collection={collection}
          onArchive={onArchive}
        />
      </ModalBody>
    </div>
  );
};

export interface TimelineMenuProps {
  timeline: Timeline;
  collection: Collection;
}

const TimelineMenu = ({
  timeline,
  collection,
}: TimelineMenuProps): JSX.Element => {
  const items = useMemo(
    () => [
      {
        title: t`New timeline`,
        link: Urls.newTimelineInCollection(collection),
      },
      {
        title: t`Edit timeline details`,
        link: Urls.editTimelineInCollection(timeline, collection),
      },
    ],
    [timeline, collection],
  );

  return <EntityMenu items={items} triggerIcon="ellipsis" />;
};

interface TimelineToolbarProps {
  timeline: Timeline;
  collection: Collection;
}

const TimelineToolbar = ({
  timeline,
  collection,
}: TimelineToolbarProps): JSX.Element => {
  return (
    <ModalToolbar>
      <Link
        className="Button"
        to={Urls.newEventInCollection(timeline, collection)}
      >{t`Add an event`}</Link>
    </ModalToolbar>
  );
};

interface TimelineListProps {
  timeline: Timeline;
  collection: Collection;
  onArchive: (event: TimelineEvent) => void;
}

const TimelineList = ({
  timeline,
  collection,
  onArchive,
}: TimelineListProps): JSX.Element => {
  return (
    <ModalList>
      {timeline.events.map(event => (
        <EventCard
          key={event.id}
          event={event}
          timeline={timeline}
          collection={collection}
          onArchive={onArchive}
        />
      ))}
    </ModalList>
  );
};

export default TimelineModal;
