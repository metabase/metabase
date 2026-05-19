import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getEventCount } from "metabase/common/utils/timelines";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import type { Timeline } from "metabase-types/api";

import S from "./AddTimelinesModal.module.css";

export interface AddTimelinesModalProps {
  opened: boolean;
  onClose: () => void;
  selection: ExplorationSelection;
}

/**
 * Modal entry point for picking timelines from the right panel's "+"
 * button. Each row commits to `selection.timelines` on click (no Done
 * required); the bottom button just closes. Selection behaviour mirrors
 * the Browse tab's Timelines panel.
 */
export function AddTimelinesModal({
  opened,
  onClose,
  selection,
}: AddTimelinesModalProps) {
  const { timelines, toggleTimeline } = selection;

  const {
    data: allTimelines = [],
    isLoading,
    error,
  } = useListTimelinesQuery({ include: "events" }, { skip: !opened });

  const [search, setSearch] = useState("");

  // Clear the search input every time the modal re-opens.
  useEffect(() => {
    if (opened) {
      setSearch("");
    }
  }, [opened]);

  const selectedIds = useMemo(
    () => new Set(timelines.map((t) => t.id)),
    [timelines],
  );

  const filteredTimelines = useMemo(
    () => filterTimelinesBySearch(allTimelines, search),
    [allTimelines, search],
  );

  return (
    <Modal.Root opened={opened} onClose={onClose} size="40rem" padding="xl">
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t`Add timelines`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t`Search for timelines`}
            leftSection={<Icon name="search" />}
            mb="md"
          />
          <LoadingAndErrorWrapper
            loading={isLoading}
            error={error}
            style={{
              height: "28rem",
            }}
          >
            <Stack gap="sm" h="28rem">
              <Text fw="bold">{t`Timelines`}</Text>
              <TimelineList
                timelines={filteredTimelines}
                selectedIds={selectedIds}
                onToggle={toggleTimeline}
              />
            </Stack>
          </LoadingAndErrorWrapper>
          <Flex justify="flex-end" mt="lg">
            <Button variant="filled" onClick={onClose}>{t`Done`}</Button>
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * Client-side case-insensitive filter across timeline name + description.
 * Extracted as a pure function so the Browse panel can reuse it with the
 * exact same matching rules as the modal.
 */
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
 * Vertical list of timeline rows with the same markup the modal has
 * always used (`role="list" / role="listitem"`, `aria-pressed`,
 * Checkbox with `aria-label={timeline.name}`). Exported so the Browse
 * panel renders identical rows, keeping the e2e selectors in
 * `H.addTimelinesToExploration` valid.
 */
export function TimelineList({
  timelines,
  selectedIds,
  onToggle,
}: TimelineListProps) {
  if (timelines.length === 0) {
    return (
      <Text c="text-secondary" py="md">
        {t`No timelines found`}
      </Text>
    );
  }

  return (
    <Box className={S.scrollContainer}>
      <Stack role="list" gap="sm">
        {timelines.map((timeline) => {
          const isSelected = selectedIds.has(timeline.id);
          return (
            <UnstyledButton
              key={timeline.id}
              role="listitem"
              aria-pressed={isSelected}
              className={cx(S.timelineItem, {
                [S.timelineItemSelected]: isSelected,
              })}
              onClick={() => onToggle(timeline)}
            >
              <Checkbox
                checked={isSelected}
                onChange={() => onToggle(timeline)}
                onClick={(event) => event.stopPropagation()}
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
        })}
      </Stack>
    </Box>
  );
}
