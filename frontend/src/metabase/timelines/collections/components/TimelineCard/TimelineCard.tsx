import cx from "classnames";
import { memo } from "react";
import { msgid, ngettext, t } from "ttag";

import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { Markdown } from "metabase/common/components/Markdown";
import {
  getEventCount,
  getTimelineName,
} from "metabase/common/utils/timelines";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Flex, Icon, Menu, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

import S from "./TimelineCard.module.css";

export interface TimelineCardProps {
  timeline: Timeline;
  onUnarchive?: (timeline: Timeline) => void;
}

const TimelineCard = ({
  timeline,
  onUnarchive,
}: TimelineCardProps): JSX.Element => {
  const timelineUrl = Urls.timelineInCollection(timeline);
  const menuItems = getMenuItems(timeline, onUnarchive);
  const eventCount = getEventCount(timeline);
  const hasDescription = Boolean(timeline.description);
  const hasMenuItems = menuItems.length > 0;
  const hasEventCount = !hasMenuItems && eventCount != null;

  return (
    <Flex
      component={Link}
      className={cx(S.card, timeline.archived ? CS.cursorDefault : S.cardLink)}
      to={timeline.archived ? "" : timelineUrl}
      align="center"
      p="1.75rem"
      bdrs="xs"
    >
      <Icon className={S.icon} name={timeline.icon} size={22} />
      <Box component="span" flex="1 1 auto" mx="1.75rem" miw={0}>
        <Text
          component="span"
          className={S.title}
          display="block"
          fw="bold"
          mb="xxxs"
          lh="normal"
        >
          {getTimelineName(timeline)}
        </Text>
        {timeline.description && (
          <Markdown className={S.description}>{timeline.description}</Markdown>
        )}
      </Box>
      {hasMenuItems && (
        <Box component="span" flex="0 0 auto">
          <Menu position="bottom-end" shadow="sm">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t`Timeline menu`}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>{menuItems}</Menu.Dropdown>
          </Menu>
        </Box>
      )}
      {hasEventCount && (
        <Text
          component="span"
          className={hasDescription ? CS.alignSelfStart : undefined}
          flex="0 0 auto"
          lh="normal"
        >
          {ngettext(
            msgid`${eventCount} event`,
            `${eventCount} events`,
            eventCount,
          )}
        </Text>
      )}
    </Flex>
  );
};

const getMenuItems = (
  timeline: Timeline,
  onUnarchive?: (timeline: Timeline) => void,
) => {
  if (!timeline.archived || !timeline.collection?.can_write) {
    return [];
  }

  return [
    <Menu.Item key="unarchive-timeline" onClick={() => onUnarchive?.(timeline)}>
      {t`Unarchive timeline`}
    </Menu.Item>,
    <Menu.Item
      key="delete-timeline"
      component={ForwardRefLink}
      to={Urls.deleteTimelineInCollection(timeline)}
    >
      {t`Delete timeline`}
    </Menu.Item>,
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(TimelineCard);
