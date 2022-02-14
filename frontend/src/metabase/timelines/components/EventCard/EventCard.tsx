import React, { useMemo } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import {
  CardAside,
  CardBody,
  CardRoot,
  CardThread,
  CardThreadIcon,
  CardThreadIconContainer,
  CardThreadStroke,
  CardTitle,
} from "./EventCard.styled";

export interface EventCardProps {
  event: TimelineEvent;
  timeline: Timeline;
  collection: Collection;
}

const EventCard = ({
  event,
  timeline,
  collection,
}: EventCardProps): JSX.Element => {
  return (
    <CardRoot>
      <CardThread>
        <CardThreadIconContainer>
          <CardThreadIcon name={event.icon} />
        </CardThreadIconContainer>
        <CardThreadStroke />
      </CardThread>
      <CardBody>
        <CardTitle>{event.name}</CardTitle>
      </CardBody>
      <CardAside>
        <EventMenu event={event} timeline={timeline} collection={collection} />
      </CardAside>
    </CardRoot>
  );
};

export interface EventMenuProps {
  event: TimelineEvent;
  timeline: Timeline;
  collection: Collection;
}

const EventMenu = ({
  event,
  timeline,
  collection,
}: EventMenuProps): JSX.Element => {
  const items = useMemo(
    () => [
      {
        title: t`Edit event`,
        link: Urls.editEventInCollection(event, timeline, collection),
      },
    ],
    [event, timeline, collection],
  );

  return <EntityMenu items={items} triggerIcon="ellipsis" />;
};

export default EventCard;
