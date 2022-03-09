import React, { ChangeEvent, memo, useCallback } from "react";
import CheckBox from "metabase/core/components/CheckBox";
import CollapseSection from "metabase/components/CollapseSection";
import { Timeline } from "metabase-types/api";
import { CardHeader, CardTitle } from "./TimelineCard.styled";
import EventList from "metabase/timelines/questions/components/EventList";

export interface TimelineCardProps {
  timeline: Timeline;
  isVisible?: boolean;
  onShowTimeline?: (timeline: Timeline) => void;
  onHideTimeline?: (timeline: Timeline) => void;
}

const TimelineCard = ({
  timeline,
  isVisible,
  onShowTimeline,
  onHideTimeline,
}: TimelineCardProps): JSX.Element => {
  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.checked) {
        onShowTimeline?.(timeline);
      } else {
        onHideTimeline?.(timeline);
      }
    },
    [timeline, onShowTimeline, onHideTimeline],
  );

  return (
    <CollapseSection
      header={
        <CardHeader>
          <CheckBox checked={isVisible} onChange={handleToggle} />
          <CardTitle>{timeline.name}</CardTitle>
        </CardHeader>
      }
      fullWidth={true}
      iconVariant="up-down"
      iconPosition="right"
    >
      <EventList timeline={timeline} />
    </CollapseSection>
  );
};

export default memo(TimelineCard);
