import React from "react";
import { Timeline } from "metabase-types/api";

export interface TimelinePanelProps {
  timelines: Timeline[];
}

const TimelinePanel = ({ timelines }: TimelinePanelProps): JSX.Element => {
  return <div />;
};

export default TimelinePanel;
