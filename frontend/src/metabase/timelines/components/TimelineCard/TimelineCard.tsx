import React from "react";
import { Timeline } from "metabase-types/api";
import {
  CardBody,
  CardDescription,
  CardIcon,
  CardRoot,
  CardTitle,
} from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
}

const TimelineCard = ({ timeline }: TimelineCardProps): JSX.Element => {
  return (
    <CardRoot>
      <CardIcon name={timeline.icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
    </CardRoot>
  );
};

export default TimelineCard;
