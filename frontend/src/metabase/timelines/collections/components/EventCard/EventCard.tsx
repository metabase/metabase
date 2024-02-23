import { memo } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import Link from "metabase/core/components/Link";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import Settings from "metabase/lib/settings";
import { parseTimestamp } from "metabase/lib/time";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import type { Timeline, TimelineEvent } from "metabase-types/api";

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
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
}

const EventCard = ({
  event,
  timeline,
  onArchive,
  onUnarchive,
}: EventCardProps): JSX.Element => {
  const menuItems = getMenuItems(event, timeline, onArchive, onUnarchive);
  const dateMessage = getDateMessage(event);
  const creatorMessage = getCreatorMessage(event);
  const canEdit = timeline.collection?.can_write && !event.archived;
  const editLink = Urls.editEventInCollection(event, timeline);

  return (
    <CardRoot>
      <CardThread>
        <CardThreadIconContainer>
          <CardThreadIcon name={event.icon as unknown as IconName} />
        </CardThreadIconContainer>
        <CardThreadStroke />
      </CardThread>
      <CardBody>
        <CardDateInfo>{dateMessage}</CardDateInfo>
        {canEdit ? (
          <CardTitle as={Link} to={editLink}>
            {event.name}
          </CardTitle>
        ) : (
          <CardTitle>{event.name}</CardTitle>
        )}
        {event.description && (
          <CardDescription>{event.description}</CardDescription>
        )}
        <CardCreatorInfo data-server-date>{creatorMessage}</CardCreatorInfo>
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
        link: Urls.editEventInCollection(event, timeline),
      },
      {
        title: t`Move event`,
        link: Urls.moveEventInCollection(event, timeline),
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
        link: Urls.deleteEventInCollection(event, timeline),
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(EventCard);
