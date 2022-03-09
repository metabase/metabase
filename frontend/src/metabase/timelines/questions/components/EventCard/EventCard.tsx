import React, { memo } from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import { parseTimestamp } from "metabase/lib/time";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { TimelineEvent } from "metabase-types/api";
import {
  CardBody,
  CardCreatorInfo,
  CardDateInfo,
  CardDescription,
  CardRoot,
  CardThread,
  CardThreadIcon,
  CardTitle,
} from "./EventCard.styled";

export interface EventCardProps {
  event: TimelineEvent;
}

const EventCard = ({ event }: EventCardProps): JSX.Element => {
  const dateMessage = getDateMessage(event);
  const creatorMessage = getCreatorMessage(event);

  return (
    <CardRoot>
      <CardThread>
        <CardThreadIcon name={event.icon} />
      </CardThread>
      <CardBody>
        <CardDateInfo>{dateMessage}</CardDateInfo>
        <CardTitle>{event.name}</CardTitle>
        {event.description && (
          <CardDescription>{event.description}</CardDescription>
        )}
        <CardCreatorInfo>{creatorMessage}</CardCreatorInfo>
      </CardBody>
    </CardRoot>
  );
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
