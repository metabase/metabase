import React from "react";
import { msgid, ngettext } from "ttag";
import { EventTimeline } from "metabase-types/api";
import {
  CardBody,
  CardDescription,
  CardIcon,
  CardInfo,
  CardRoot,
  CardTitle,
} from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: EventTimeline;
}

const TimelineCard = ({ timeline }: TimelineCardProps): JSX.Element => {
  const events = timeline.events.length;

  return (
    <CardRoot to="">
      <CardIcon name={timeline.default_icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
      <CardInfo>
        {ngettext(msgid`${events} event`, `${events} events`, events)}
      </CardInfo>
    </CardRoot>
  );
};

export default TimelineCard;
