import React from "react";
import { Event } from "metabase-types/api";
import {
  CardRoot,
  CardThread,
  CardThreadIcon,
  CardThreadIconContainer,
  CardThreadStroke,
} from "./EventCard.styled";

export interface EventCardProps {
  event: Event;
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
    </CardRoot>
  );
};

export default EventCard;
