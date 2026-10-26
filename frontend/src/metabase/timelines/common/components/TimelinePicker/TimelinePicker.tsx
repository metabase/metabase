import cx from "classnames";
import { useCallback } from "react";
import { msgid, ngettext } from "ttag";

import { getEventCount } from "metabase/common/utils/timelines";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Stack } from "metabase/ui";
import type { Timeline } from "metabase-types/api";

import S from "./TimelinePicker.module.css";

export interface TimelinePickerProps {
  value?: Timeline;
  options: Timeline[];
  onChange?: (value: Timeline) => void;
}

export const TimelinePicker = ({
  value,
  options,
  onChange,
}: TimelinePickerProps) => {
  return (
    <Stack gap="sm">
      {options.map((option) => (
        <TimelineCard
          key={option.id}
          timeline={option}
          isSelected={option.id === value?.id}
          onChange={onChange}
        />
      ))}
    </Stack>
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
      className={cx(S.card, CS.cursorPointer, { [S.selected]: isSelected })}
      align="center"
      p="lg"
      bdrs="xxs"
      onClick={handleClick}
    >
      <Flex
        className={S.iconBorder}
        flex="0 0 auto"
        justify="center"
        align="center"
        w="2rem"
        h="2rem"
      >
        <Icon className={S.icon} name={timeline.icon} />
      </Flex>
      <Box flex="1 1 auto" mx="lg" miw={0}>
        <Box className={S.title} fz="1rem" fw="bold" mb="xxxs">
          {timeline.name}
        </Box>
        <Box className={S.description} fz="sm">
          {timeline.description}
        </Box>
      </Box>
      <Box className={S.aside} flex="0 0 auto" fz="sm">
        {ngettext(
          msgid`${eventCount} event`,
          `${eventCount} events`,
          eventCount,
        )}
      </Box>
    </Flex>
  );
};
