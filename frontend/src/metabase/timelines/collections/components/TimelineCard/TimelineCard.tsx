import React, { memo } from "react";
import { t, msgid, ngettext } from "ttag";
import * as Urls from "metabase/lib/urls";
import { Collection, Timeline } from "metabase-types/api";
import {
  CardAside,
  CardBody,
  CardDescription,
  CardIcon,
  CardRoot,
  CardTitle,
} from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
  collection: Collection;
  onUnarchive?: (timeline: Timeline) => void;
}

const TimelineCard = ({
  timeline,
  collection,
}: TimelineCardProps): JSX.Element => {
  const timelineUrl = Urls.timelineInCollection(timeline, collection);
  const menuItems = getMenuItems(timeline, collection);
  const eventsCount = timeline.events?.length;
  const hasDescription = Boolean(timeline.description);

  return (
    <CardRoot to={!timeline.archived ? timelineUrl : ""}>
      <CardIcon name={timeline.icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
      {eventsCount != null && (
        <CardAside isTopAligned={hasDescription}>
          {ngettext(
            msgid`${eventsCount} event`,
            `${eventsCount} events`,
            eventsCount,
          )}
        </CardAside>
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
