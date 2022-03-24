import React, { memo } from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import { parseTimestamp } from "metabase/lib/time";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, TimelineEvent } from "metabase-types/api";
import {
  CardBody,
  CardCreatorInfo,
  CardDateInfo,
  CardDescription,
  CardRoot,
  CardIcon,
  CardIconContainer,
  CardTitle,
  CardAside,
} from "./EventCard.styled";

export interface EventCardProps {
  event: TimelineEvent;
  collection: Collection;
  isSelected?: boolean;
  onEdit?: (event: TimelineEvent) => void;
  onArchive?: (event: TimelineEvent) => void;
}

const EventCard = ({
  event,
  collection,
  isSelected,
  onEdit,
  onArchive,
}: EventCardProps): JSX.Element => {
  const menuItems = getMenuItems(event, collection, onEdit, onArchive);
  const dateMessage = getDateMessage(event);
  const creatorMessage = getCreatorMessage(event);

  return (
    <CardRoot isSelected={isSelected}>
      <CardIconContainer>
        <CardIcon name={event.icon} />
      </CardIconContainer>
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
  collection: Collection,
  onEdit?: (event: TimelineEvent) => void,
  onArchive?: (event: TimelineEvent) => void,
) => {
  if (collection.can_write) {
    return [
      {
        title: t`Edit event`,
        action: () => onEdit?.(event),
      },
      {
        title: t`Archive event`,
        action: () => onArchive?.(event),
      },
    ];
  } else {
    return [];
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
