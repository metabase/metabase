import { memo } from "react";
import { msgid, ngettext, t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import { getEventCount, getTimelineName } from "metabase/lib/timelines";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import type { Timeline } from "metabase-types/api";

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
          <EntityMenu items={menuItems} triggerIcon="ellipsis" />
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
    {
      title: t`Unarchive timeline`,
      action: () => onUnarchive?.(timeline),
    },
    {
      title: t`Delete timeline`,
      link: Urls.deleteTimelineInCollection(timeline),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(TimelineCard);
