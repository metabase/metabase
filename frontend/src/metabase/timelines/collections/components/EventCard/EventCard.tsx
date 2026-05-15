import { memo } from "react";
import { t } from "ttag";

import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import Settings from "metabase/utils/settings";
import { formatDateTimeWithUnit } from "metabase/visualizations/lib/formatting";
import type { IconName, Timeline, TimelineEvent } from "metabase-types/api";

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
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t`Event menu`}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>{menuItems}</Menu.Dropdown>
          </Menu>
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
      <Menu.Item
        key="edit-event"
        component={ForwardRefLink}
        to={Urls.editEventInCollection(event, timeline)}
      >
        {t`Edit event`}
      </Menu.Item>,
      <Menu.Item
        key="move-event"
        component={ForwardRefLink}
        to={Urls.moveEventInCollection(event, timeline)}
      >
        {t`Move event`}
      </Menu.Item>,
      <Menu.Item key="archive-event" onClick={() => onArchive?.(event)}>
        {t`Archive event`}
      </Menu.Item>,
    ];
  } else {
    return [
      <Menu.Item key="unarchive-event" onClick={() => onUnarchive?.(event)}>
        {t`Unarchive event`}
      </Menu.Item>,
      <Menu.Item
        key="delete-event"
        component={ForwardRefLink}
        to={Urls.deleteEventInCollection(event, timeline)}
      >
        {t`Delete event`}
      </Menu.Item>,
    ];
  }
};

const getDateMessage = (event: TimelineEvent) => {
  const date = event.timestamp;
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
