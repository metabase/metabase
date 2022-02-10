import React from "react";
import * as Urls from "metabase/lib/urls";
import { Collection, Timeline } from "metabase-types/api";
import {
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
  const url = Urls.timeline(timeline, collection);

  return (
    <CardRoot to={url}>
      <CardIcon name={timeline.icon} />
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
    </CardRoot>
  );
};

export default TimelineCard;
