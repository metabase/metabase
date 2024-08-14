import { useCallback } from "react";
import { msgid, ngettext } from "ttag";

import { getEventCount } from "metabase/lib/timelines";
import type { IconName } from "metabase/ui";
import type { Timeline } from "metabase-types/api";

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

const TimelinePicker = ({ value, options, onChange }: TimelinePickerProps) => {
  return (
    <ListRoot>
      {options.map(option => (
        <TimelineCard
          key={option.id}
          timeline={option}
          isSelected={option.id === value?.id}
          onChange={onChange}
        />
      ))}
    </ListRoot>
  );
};

interface TimelineCardProps {
  timeline: Timeline;
  isSelected: boolean;
  onChange?: (value: Timeline) => void;
}

const TimelineCard = ({
  timeline,
  isSelected,
  onChange,
}: TimelineCardProps): JSX.Element => {
  const eventCount = getEventCount(timeline);

  const handleClick = useCallback(() => {
    onChange?.(timeline);
  }, [timeline, onChange]);

  return (
    <CardRoot key={timeline.id} isSelected={isSelected} onClick={handleClick}>
      <CardIconContainer>
        <CardIcon name={timeline.icon as unknown as IconName} />
      </CardIconContainer>
      <CardBody>
        <CardTitle>{timeline.name}</CardTitle>
        <CardDescription>{timeline.description}</CardDescription>
      </CardBody>
      <CardAside>
        {ngettext(
          msgid`${eventCount} event`,
          `${eventCount} events`,
          eventCount,
        )}
      </CardAside>
    </CardRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelinePicker;
