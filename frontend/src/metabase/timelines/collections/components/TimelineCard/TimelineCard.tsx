import React, { memo } from "react";
import { t, msgid, ngettext } from "ttag";
import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline } from "metabase-types/api";
import {
  CardCount,
  CardBody,
  CardDescription,
  CardIcon,
  CardRoot,
  CardTitle,
  CardMenu,
} from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
  collection: Collection;
  onUnarchive?: (timeline: Timeline) => void;
}

const TimelineCard = ({
  timeline,
  collection,
  onUnarchive,
}: TimelineCardProps): JSX.Element => {
  const timelineUrl = Urls.timelineInCollection(timeline, collection);
  const menuItems = getMenuItems(timeline, collection, onUnarchive);
  const eventCount = timeline.events?.length;
  const hasDescription = Boolean(timeline.description);
  const hasMenuItems = menuItems.length > 0;
  const hasEventCount = !hasMenuItems && eventCount != null;

  return (
    <CardRoot to={!timeline.archived ? timelineUrl : ""}>
      <CardIcon name={timeline.icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
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
  collection: Collection,
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
      link: Urls.deleteTimelineInCollection(timeline, collection),
    },
  ];
};

export default memo(TimelineCard);
