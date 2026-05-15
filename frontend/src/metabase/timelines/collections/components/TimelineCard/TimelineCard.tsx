import { memo } from "react";
import { msgid, ngettext, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  getEventCount,
  getTimelineName,
} from "metabase/common/utils/timelines";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName, Timeline } from "metabase-types/api";

import {
  CardBody,
  CardCount,
  CardDescription,
  CardIcon,
  CardMenu,
  CardRoot,
  CardTitle,
} from "./TimelineCard.styled";

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
    <CardRoot to={!timeline.archived ? timelineUrl : ""}>
      <CardIcon name={timeline.icon as unknown as IconName} />
      <CardBody>
        <CardTitle>{getTimelineName(timeline)}</CardTitle>
        {timeline.description && (
          <CardDescription>{timeline.description}</CardDescription>
        )}
      </CardBody>
      {hasMenuItems && (
        <CardMenu>
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t`Timeline menu`}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>{menuItems}</Menu.Dropdown>
          </Menu>
        </CardMenu>
      )}
      {hasEventCount && (
        <CardCount isTopAligned={hasDescription}>
          {ngettext(
            msgid`${eventCount} event`,
            `${eventCount} events`,
            eventCount,
          )}
        </CardCount>
      )}
    </CardRoot>
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
