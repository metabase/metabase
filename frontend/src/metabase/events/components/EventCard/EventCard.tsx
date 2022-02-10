import React from "react";
import { TimelineEvent } from "metabase-types/api";
import {
  CardBody,
  CardRoot,
  CardThread,
  CardThreadIcon,
  CardThreadIconContainer,
  CardThreadStroke,
  CardTitle,
} from "./EventCard.styled";

export interface EventCardProps {
  event: TimelineEvent;
}

const EventCard = ({ event }: EventCardProps): JSX.Element => {
  return (
    <CardRoot>
      <CardThread>
        <CardThreadIconContainer>
          <CardThreadIcon name={event.icon} />
        </CardThreadIconContainer>
        <CardThreadStroke />
      </CardThread>
      <CardBody>
        <CardTitle>{event.name}</CardTitle>
      </CardBody>
    </CardRoot>
  );
};

export default EventCard;
