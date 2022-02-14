import React from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import {
  CardAside,
  CardBody,
  CardDescription,
  CardInfo,
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
  const menuItems = getMenuItems(event, timeline, collection);
  const createdAtMessage = getCreatedAtMessage(event);

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
        {event.description && (
          <CardDescription>{event.description}</CardDescription>
        )}
        <CardInfo>{createdAtMessage}</CardInfo>
      </CardBody>
      <CardAside>
        <EntityMenu items={menuItems} triggerIcon="ellipsis" />
      </CardAside>
    </CardRoot>
  );
};

const getMenuItems = (
  event: TimelineEvent,
  timeline: Timeline,
  collection: Collection,
) => {
  return [
    {
      title: t`Edit event`,
      link: Urls.editEventInCollection(event, timeline, collection),
    },
  ];
};

const getCreatedAtMessage = (event: TimelineEvent) => {
  const options = Settings.formattingOptions();
  const createdAt = formatDateTimeWithUnit(event.created_at, "day", options);

  if (event.creator) {
    return t`${event.creator.common_name} added this on ${createdAt}`;
  } else {
    return t`Added on ${createdAt}`;
  }
};

export default EventCard;
