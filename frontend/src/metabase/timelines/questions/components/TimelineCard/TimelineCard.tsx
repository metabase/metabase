import React, { memo } from "react";
import CheckBox from "metabase/core/components/CheckBox";
import CollapseSection from "metabase/components/CollapseSection";
import { Timeline } from "metabase-types/api";
import EventCard from "../EventCard";
import { CardBody, CardHeader, CardTitle } from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
}

const TimelineCard = ({ timeline }: TimelineCardProps): JSX.Element => {
  return (
    <CollapseSection
      header={
        <CardHeader>
          <CheckBox checked={true} />
          <CardTitle>{timeline.name}</CardTitle>
        </CardHeader>
      }
      fullWidth={true}
      iconPosition="right"
    >
      <CardBody>
        {timeline.events?.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </CardBody>
    </CollapseSection>
  );
};

export default memo(TimelineCard);
