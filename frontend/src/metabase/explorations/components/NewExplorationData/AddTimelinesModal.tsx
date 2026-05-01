import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getEventCount } from "metabase/common/utils/timelines";
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
  selectedTimelines: Timeline[];
  onSelectedItemsChange: (newTimelines: Timeline[]) => void;
}

export function AddTimelinesModal({
  opened,
  onClose,
  selectedTimelines,
  onSelectedItemsChange,
}: AddTimelinesModalProps) {
  const {
    data: allTimelines = [],
    isLoading,
    error,
  } = useListTimelinesQuery({ include: "events" }, { skip: !opened });

  const [search, setSearch] = useState("");

  const [draftTimelines, setDraftTimelines] =
    useState<Timeline[]>(selectedTimelines);

  // Reset the draft from props whenever the modal opens.
  useEffect(() => {
    if (opened) {
      setDraftTimelines(selectedTimelines);
      setSearch("");
    }
    // We intentionally only re-seed on `opened` transitions, not on every
    // parent change, so the user's in-flight edits aren't clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleDone = useCallback(() => {
    onSelectedItemsChange(draftTimelines);
    onClose();
  }, [draftTimelines, onSelectedItemsChange, onClose]);

  const selectedIds = useMemo(
    () => new Set(draftTimelines.map((t) => t.id)),
    [draftTimelines],
  );

  const filteredTimelines = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return allTimelines;
    }
    return allTimelines.filter(
      (timeline) =>
        timeline.name.toLowerCase().includes(query) ||
        (timeline.description?.toLowerCase().includes(query) ?? false),
    );
  }, [allTimelines, search]);

  const toggleTimeline = useCallback(
    (timeline: Timeline) => {
      if (selectedIds.has(timeline.id)) {
        setDraftTimelines(draftTimelines.filter((t) => t.id !== timeline.id));
      } else {
        setDraftTimelines([...draftTimelines, timeline]);
      }
    },
    [draftTimelines, selectedIds],
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
            <Button variant="filled" onClick={handleDone}>{t`Done`}</Button>
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
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

function TimelineList({ timelines, selectedIds, onToggle }: TimelineListProps) {
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
