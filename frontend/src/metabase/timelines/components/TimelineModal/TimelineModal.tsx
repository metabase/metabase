import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { Collection, Timeline } from "metabase-types/api";
import EventCard from "../EventCard";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalToolbar } from "./TimelineModal.styled";

export interface TimelineModalProps {
  timeline: Timeline;
  collection: Collection;
  onClose?: () => void;
}

const TimelineModal = ({
  timeline,
  collection,
  onClose,
}: TimelineModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={timeline.name} onClose={onClose} />
      <ModalBody>
        <EventToolbar timeline={timeline} collection={collection} />
        <EventList timeline={timeline} />
      </ModalBody>
    </div>
  );
};

interface EventToolbarProps {
  timeline: Timeline;
  collection: Collection;
}

const EventToolbar = ({
  timeline,
  collection,
}: EventToolbarProps): JSX.Element => {
  return (
    <ModalToolbar>
      <Link
        className="Button"
        to={Urls.newEventInCollection(timeline, collection)}
      >{t`Add an event`}</Link>
    </ModalToolbar>
  );
};

interface EventListProps {
  timeline: Timeline;
}

const EventList = ({ timeline }: EventListProps): JSX.Element => {
  return (
    <div>
      {timeline.events.map(event => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
};

export default TimelineModal;
