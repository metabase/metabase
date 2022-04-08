import React from "react";
import { Timeline } from "metabase-types/api";

export interface TimelinePickerProps {
  value?: Timeline;
  options: Timeline[];
  onChange?: (value: Timeline) => void;
}

const TimelinePicker = () => {
  return <div />;
};

export default TimelinePicker;
