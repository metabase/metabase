import React from "react";
import { Timeline } from "metabase-types/api";
import TimelineCard from "../TimelineCard";
import { PanelRoot } from "./TimelinePanel.styled";

export interface TimelinePanelProps {
  timelines: Timeline[];
}

const TimelinePanel = ({ timelines }: TimelinePanelProps): JSX.Element => {
  return (
    <PanelRoot>
      {timelines.map(timeline => (
        <TimelineCard key={timeline.id} timeline={timeline} />
      ))}
    </PanelRoot>
  );
};

export default TimelinePanel;
