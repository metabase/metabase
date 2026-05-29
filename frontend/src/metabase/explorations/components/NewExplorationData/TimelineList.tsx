import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { getEventCount } from "metabase/common/utils/timelines";
import { paletteTimelineDragId } from "metabase/explorations/hooks";
import {
  Box,
  Checkbox,
  Flex,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

import S from "./TimelineList.module.css";

export function filterTimelinesBySearch(
  timelines: Timeline[],
  search: string,
): Timeline[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return timelines;
  }
  return timelines.filter(
    (timeline) =>
      timeline.name.toLowerCase().includes(query) ||
      (timeline.description?.toLowerCase().includes(query) ?? false),
  );
}

function formatEventCount(count: number) {
  return ngettext(msgid`${count} event`, `${count} events`, count);
}

interface TimelineListProps {
  timelines: Timeline[];
  selectedIds: Set<Timeline["id"]>;
  onToggle: (timeline: Timeline) => void;
}

/**
 * Vertical list of timeline rows — `role="list" / role="listitem"`,
 * `aria-pressed`, a `Checkbox` with `aria-label={timeline.name}`.
 * Rendered by the Browse → Timelines panel.
 */
export function TimelineList({
  timelines,
  selectedIds,
  onToggle,
}: TimelineListProps) {
  if (timelines.length === 0) {
    return (
      <Text c="text-secondary" py="md">
        {t`No timelines found.`}{" "}
        <Link to={Urls.timelinesInCollection()} target="_blank" variant="brand">
          <Flex gap={2} display="inline-flex" align="center">
            <Icon name="external" size={12} />
            {t`Add one`}
          </Flex>
        </Link>
      </Text>
    );
  }

  return (
    <Box className={S.scrollContainer}>
      <Stack role="list" gap="sm">
        {timelines.map((timeline) => (
          <DraggableTimelineRow
            key={timeline.id}
            timeline={timeline}
            isSelected={selectedIds.has(timeline.id)}
            onToggle={onToggle}
          />
        ))}
      </Stack>
    </Box>
  );
}

interface DraggableTimelineRowProps {
  timeline: Timeline;
  isSelected: boolean;
  onToggle: (timeline: Timeline) => void;
}

function DraggableTimelineRow({
  timeline,
  isSelected,
  onToggle,
}: DraggableTimelineRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteTimelineDragId(timeline.id),
    data: {
      kind: "timeline" as const,
      payload: timeline,
    },
  });

  return (
    <UnstyledButton
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="listitem"
      aria-pressed={isSelected}
      className={cx(S.timelineItem, {
        [S.timelineItemSelected]: isSelected,
        [S.timelineItemDragging]: isDragging,
      })}
      onClick={() => onToggle(timeline)}
    >
      <Checkbox
        checked={isSelected}
        onChange={() => onToggle(timeline)}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={timeline.name}
      />
      <Stack gap="xs" flex={1}>
        <Text fw="bold" lh="1.25" lineClamp={1}>
          {timeline.name}
        </Text>
        {timeline.description && (
          <Text size="sm" c="text-secondary" lineClamp={1}>
            {timeline.description}
          </Text>
        )}
      </Stack>
      <Text size="sm" c="text-secondary">
        {formatEventCount(getEventCount(timeline))}
      </Text>
    </UnstyledButton>
  );
}
