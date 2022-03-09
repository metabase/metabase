import React from "react";
import { TimelineEvent } from "metabase-types/api";

export interface EventCardProps {
  event: TimelineEvent;
}

const EventCard = ({ event }: EventCardProps): JSX.Element => {
  return <div />;
};

export default EventCard;
