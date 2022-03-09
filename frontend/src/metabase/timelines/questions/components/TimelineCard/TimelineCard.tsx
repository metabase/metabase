import React from "react";
import CheckBox from "metabase/core/components/CheckBox";
import CollapseSection from "metabase/components/CollapseSection";
import { Timeline } from "metabase-types/api";
import { CardTitle, CardToggle } from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
}

const TimelineCard = ({ timeline }: TimelineCardProps): JSX.Element => {
  return (
    <CollapseSection
      header={
        <CardToggle>
          <CheckBox checked={true} />
          <CardTitle>{timeline.name}</CardTitle>
        </CardToggle>
      }
      fullWidth={true}
      iconPosition="right"
    />
  );
};

export default TimelineCard;
