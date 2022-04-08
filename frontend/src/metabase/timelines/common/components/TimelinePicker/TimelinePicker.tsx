import React from "react";
import { Timeline } from "metabase-types/api";
import {
  CardAside,
  CardBody,
  CardDescription,
  CardIcon,
  CardIconContainer,
  CardRoot,
  CardTitle,
  ListRoot,
} from "./TimelinePicker.styled";

export interface TimelinePickerProps {
  value?: Timeline;
  options: Timeline[];
  onChange?: (value: Timeline) => void;
}

const TimelinePicker = ({ options }: TimelinePickerProps) => {
  return (
    <ListRoot>
      {options.map(option => (
        <CardRoot key={option.id}>
          <CardIconContainer>
            <CardIcon name={option.icon} />
          </CardIconContainer>
          <CardBody>
            <CardTitle>{option.name}</CardTitle>
            <CardDescription>{option.description}</CardDescription>
          </CardBody>
          <CardAside>0 events</CardAside>
        </CardRoot>
      ))}
    </ListRoot>
  );
};

export default TimelinePicker;
