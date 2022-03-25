import React, { memo } from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { parseTimestamp } from "metabase/lib/time";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import {
  CardAside,
  CardBody,
  CardCreatorInfo,
  CardDateInfo,
  CardDescription,
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
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
}

const EventCard = ({
  event,
  timeline,
  collection,
  onArchive,
  onUnarchive,
}: EventCardProps): JSX.Element => {
  const menuItems = getMenuItems(
    event,
    timeline,
    collection,
    onArchive,
    onUnarchive,
  );
  const dateMessage = getDateMessage(event);
  const creatorMessage = getCreatorMessage(event);

  return (
    <CardRoot>
      <CardThread>
        <CardThreadIconContainer>
          <CardThreadIcon name={event.icon} />
        </CardThreadIconContainer>
        <CardThreadStroke />
      </CardThread>
      <CardBody>
        <CardDateInfo>{dateMessage}</CardDateInfo>
        <CardTitle>{event.name}</CardTitle>
        {event.description && (
          <CardDescription>{event.description}</CardDescription>
        )}
        <CardCreatorInfo>{creatorMessage}</CardCreatorInfo>
      </CardBody>
      {menuItems.length > 0 && (
        <CardAside>
          <EntityMenu items={menuItems} triggerIcon="ellipsis" />
        </CardAside>
      )}
    </CardRoot>
  );
};

const getMenuItems = (
  event: TimelineEvent,
  timeline: Timeline,
  collection: Collection,
  onArchive?: (event: TimelineEvent) => void,
  onUnarchive?: (event: TimelineEvent) => void,
) => {
  if (!timeline.collection?.can_write) {
    return [];
  }

  if (!event.archived) {
    return [
      {
        title: t`Edit event`,
        link: Urls.editEventInCollection(event, timeline, collection),
      },
      {
        title: t`Archive event`,
        action: () => onArchive?.(event),
      },
    ];
  } else {
    return [
      {
        title: t`Unarchive event`,
        action: () => onUnarchive?.(event),
      },
      {
        title: t`Delete event`,
        link: Urls.deleteEventInCollection(event, timeline, collection),
      },
    ];
  }
};

const getDateMessage = (event: TimelineEvent) => {
  const date = parseTimestamp(event.timestamp);
  const options = Settings.formattingOptions();

  if (event.time_matters) {
    return formatDateTimeWithUnit(date, "default", options);
  } else {
    return formatDateTimeWithUnit(date, "day", options);
  }
};

const getCreatorMessage = (event: TimelineEvent) => {
  const options = Settings.formattingOptions();
  const createdAt = formatDateTimeWithUnit(event.created_at, "day", options);

  if (event.creator) {
    return t`${event.creator.common_name} added this on ${createdAt}`;
  } else {
    return t`Added on ${createdAt}`;
  }
};

export default memo(EventCard);
