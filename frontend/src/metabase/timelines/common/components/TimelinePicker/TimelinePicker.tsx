import cx from "classnames";
import { useCallback } from "react";
import { msgid, ngettext } from "ttag";

import { getEventCount } from "metabase/common/utils/timelines";
import { Box, Flex, Icon } from "metabase/ui";
import type { Timeline } from "metabase-types/api";

import S from "./TimelinePicker.module.css";

export interface TimelinePickerProps {
  value?: Timeline;
  options: Timeline[];
  onChange?: (value: Timeline) => void;
}

const TimelinePicker = ({ value, options, onChange }: TimelinePickerProps) => {
  return (
    <Box>
      {options.map((option) => (
        <TimelineCard
          key={option.id}
          timeline={option}
          isSelected={option.id === value?.id}
          onChange={onChange}
        />
      ))}
    </Box>
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
    <Flex
      key={timeline.id}
      className={cx(S.cardRoot, { [S.selected]: isSelected })}
      align="center"
      p="lg"
      onClick={handleClick}
    >
      <Flex
        className={S.cardIconContainer}
        flex="0 0 auto"
        justify="center"
        align="center"
        w="2rem"
        h="2rem"
      >
        <Icon className={S.cardIcon} name={timeline.icon} />
      </Flex>
      <Box flex="1 1 auto" mx="lg" miw={0}>
        <Box className={S.cardTitle} fz="1rem" fw="bold" mb="xxxs">
          {timeline.name}
        </Box>
        <Box className={S.cardDescription} fz="sm">
          {timeline.description}
        </Box>
      </Box>
      <Box className={S.cardAside} flex="0 0 auto" fz="sm">
        {ngettext(
          msgid`${eventCount} event`,
          `${eventCount} events`,
          eventCount,
        )}
      </Box>
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelinePicker;
