import React, { memo } from "react";
import { msgid, ngettext } from "ttag";
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
}

const TimelineCard = ({
  timeline,
  collection,
}: TimelineCardProps): JSX.Element => {
  const eventsCount = timeline.events?.length;
  const hasDescription = Boolean(timeline.description);

  return (
    <CardRoot to={Urls.timelineInCollection(timeline, collection)}>
      <CardIcon name={timeline.icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        {timeline.description && (
          <CardDescription>{timeline.description}</CardDescription>
        )}
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

export default memo(TimelineCard);
