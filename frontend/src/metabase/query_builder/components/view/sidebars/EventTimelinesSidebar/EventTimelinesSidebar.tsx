import React, { useCallback } from "react";
import { t } from "ttag";
import { Timeline } from "metabase-types/api/timeline";
import CheckBox from "metabase/core/components/CheckBox";
import CollapseSection from "metabase/components/CollapseSection";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import EventCard from "./EventCard";
import {
  TimelineList,
  TimelineListItemContainer,
  TimelineName,
  EventListContainer,
} from "./EventTimelinesSidebar.styled";

type TimelineListItemProps = {
  name: string;
  isSelected: boolean;
  onToggle: () => void;
};

function TimelineListItem({
  name,
  isSelected,
  onToggle,
}: TimelineListItemProps) {
  const onChange = useCallback(
    e => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle],
  );

  return (
    <TimelineListItemContainer>
      <CheckBox
        checked={isSelected}
        onChange={onChange}
        onClick={e => e.stopPropagation()}
      />
      <TimelineName>{name}</TimelineName>
    </TimelineListItemContainer>
  );
}

type EventTimelinesSidebarProps = {
  timelines: Timeline[];
  hiddenTimelines: number[];
  onShowTimeline: (timelineId: number) => void;
  onHideTimeline: (timelineId: number) => void;
  onClose: () => void;
};

function EventTimelinesSidebar({
  timelines,
  hiddenTimelines,
  onShowTimeline,
  onHideTimeline,
  onClose,
}: EventTimelinesSidebarProps) {
  return (
    <SidebarContent title={t`Events`} onClose={onClose}>
      <TimelineList>
        {timelines.map(timeline => {
          const isVisible = !hiddenTimelines.includes(timeline.id);
          const onToggle = () => {
            if (isVisible) {
              onHideTimeline(timeline.id);
            } else {
              onShowTimeline(timeline.id);
            }
          };
          return (
            <li key={timeline.id}>
              <CollapseSection
                header={
                  <TimelineListItem
                    name={timeline.name}
                    isSelected={isVisible}
                    onToggle={onToggle}
                  />
                }
                iconPosition="right"
              >
                <ul>
                  <EventListContainer>
                    {timeline.events?.map(event => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </EventListContainer>
                </ul>
              </CollapseSection>
            </li>
          );
        })}
      </TimelineList>
    </SidebarContent>
  );
}

export default EventTimelinesSidebar;
