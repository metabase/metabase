import React from "react";
import { EventTimeline } from "metabase-types/api";
import {
  CardBody,
  CardDescription,
  CardIcon,
  CardRoot,
  CardTitle,
} from "./EventTimelineCard.styled";

export interface EventTimelineCardProps {
  timeline: EventTimeline;
}

const EventTimelineCard = ({
  timeline,
}: EventTimelineCardProps): JSX.Element => {
  return (
    <CardRoot to="">
      <CardIcon name={timeline.default_icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
    </CardRoot>
  );
};

export default EventTimelineCard;
