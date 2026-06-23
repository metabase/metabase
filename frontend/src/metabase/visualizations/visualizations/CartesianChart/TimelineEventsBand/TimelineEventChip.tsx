import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Anchor, Icon, Popover, Stack, Text, Tooltip } from "metabase/ui";

import S from "./TimelineEventsBand.module.css";
import { TimelineEventsList } from "./TimelineEventsList";
import type { PositionedTimelineEventGroup } from "./utils";

interface TimelineEventChipProps {
  positioned: PositionedTimelineEventGroup;
  centerY: number;
  onOpenTimelines?: () => void;
  onSelectTimelineEvents?: (
    events: PositionedTimelineEventGroup["group"]["events"],
  ) => void;
  onDeselectTimelineEvents?: () => void;
}

const CHIP_SIZE = 24;

export const TimelineEventChip = ({
  positioned,
  centerY,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
}: TimelineEventChipProps) => {
  const { group, x, isSelected, iconName, count } = positioned;
  const { events } = group;
  const [opened, setOpened] = useState(false);

  const handleChange = useCallback(
    (isOpen: boolean) => {
      setOpened(isOpen);
      if (isOpen) {
        onSelectTimelineEvents?.(events);
      } else {
        onDeselectTimelineEvents?.();
      }
    },
    [events, onSelectTimelineEvents, onDeselectTimelineEvents],
  );

  return (
    <Popover opened={opened} onChange={handleChange} position="top" withArrow>
      <Popover.Target>
        <Tooltip
          label={<ChipTooltipLabel positioned={positioned} />}
          disabled={opened}
        >
          <button
            type="button"
            className={cx(S.chip, { [S.chipSelected]: isSelected || opened })}
            style={{
              left: x,
              top: centerY - CHIP_SIZE / 2,
            }}
            data-testid="timeline-event-chip"
            aria-label={getChipLabel(positioned)}
            onClick={() => handleChange(!opened)}
          >
            {count > 1 ? (
              <span className={S.count}>{count}</span>
            ) : (
              <Icon name={iconName} size={12} />
            )}
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="md">
          <TimelineEventsList events={events} />
          {onOpenTimelines != null && (
            <Anchor
              component="button"
              type="button"
              ta="center"
              fw="bold"
              onClick={onOpenTimelines}
            >
              {t`See all`}
            </Anchor>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

const getChipLabel = ({ group, count }: PositionedTimelineEventGroup) =>
  count > 1 ? t`${count} events` : group.events[0].name;

const ChipTooltipLabel = ({
  positioned,
}: {
  positioned: PositionedTimelineEventGroup;
}) => {
  const { group, count } = positioned;
  if (count > 1) {
    return <Text c="inherit">{t`${count} events`}</Text>;
  }
  const event = group.events[0];
  return (
    <Stack gap={0}>
      <Text c="inherit" fw="bold">
        {event.name}
      </Text>
      <DateTime
        value={event.timestamp}
        unit={event.time_matters ? "default" : "day"}
      />
    </Stack>
  );
};
