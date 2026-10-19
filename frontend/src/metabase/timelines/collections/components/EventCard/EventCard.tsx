import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { Markdown } from "metabase/common/components/Markdown";
import { ActionIcon, Box, Center, Flex, Icon, Menu, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import Settings from "metabase/utils/settings";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import S from "./EventCard.module.css";

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
    <Flex mih="5rem">
      <Flex direction="column" align="center">
        <Center className={S.threadIcon} w="xxl" h="xxl" bdrs="lg">
          <Icon name={event.icon} c="core-brand" />
        </Center>
        <Box className={S.threadStroke} flex="1 1 auto" />
      </Flex>
      <Box flex="1 1 auto" pt="xxs" px="md" pb="sm" miw={0}>
        <Text c="core-brand" fz="sm" fw="bold">
          {dateMessage}
        </Text>
        {canEdit ? (
          <Text
            component={Link}
            className={cx(S.title, S.titleLink)}
            to={editLink}
            fz="1rem"
            lh="1.25rem"
            fw="bold"
          >
            {event.name}
          </Text>
        ) : (
          <Text className={S.title} fz="1rem" lh="1.25rem" fw="bold">
            {event.name}
          </Text>
        )}
        {event.description && (
          <Markdown className={S.description}>{event.description}</Markdown>
        )}
        <Text c="text-secondary" mt="xxs" fz="sm" lh="normal" data-server-date>
          {creatorMessage}
        </Text>
      </Box>
      {menuItems.length > 0 && (
        <Box flex="0 0 auto">
          <Menu position="bottom-end" shadow="sm">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t`Event menu`}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>{menuItems}</Menu.Dropdown>
          </Menu>
        </Box>
      )}
    </Flex>
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
