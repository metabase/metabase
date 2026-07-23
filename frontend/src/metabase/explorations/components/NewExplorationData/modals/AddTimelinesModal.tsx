import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import TimelineEmptyState from "metabase/timelines/collections/components/TimelineEmptyState";
import { Box } from "metabase/ui";

import { AddEntitiesModal } from "./AddEntitiesModal";

export interface AddTimelinesModalProps {
  opened: boolean;
  onClose: () => void;
  selection: ExplorationSelection;
}

export function AddTimelinesModal({
  opened,
  onClose,
  selection,
}: AddTimelinesModalProps) {
  const {
    timelines,
    allTimelines,
    timelinesLoading,
    timelinesError,
    setTimelines,
    collection,
  } = selection;

  const [search, setSearch] = useState("");

  const timelinesWithEvents = useMemo(() => {
    return allTimelines.filter(
      (timeline) => (timeline.events?.length ?? 0) > 0,
    );
  }, [allTimelines]);

  const hasTimelines = timelinesWithEvents.length > 0;
  const showEmptyState = opened && !hasTimelines;
  const { data: timelineCollection } = useGetCollectionQuery(
    showEmptyState ? { id: collection?.id || ROOT_COLLECTION.id } : skipToken,
  );

  const selectedKeys = useMemo(
    () => new Set(timelines.map((timeline) => String(timeline.id))),
    [timelines],
  );

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return timelinesWithEvents
      .filter(
        (timeline) =>
          query === "" ||
          timeline.name.toLowerCase().includes(query) ||
          (timeline.description ?? "").toLowerCase().includes(query),
      )
      .map((timeline) => {
        const eventCount = timeline.events?.length ?? 0;
        return {
          key: String(timeline.id),
          label: timeline.name,
          description: ngettext(
            msgid`${eventCount} event`,
            `${eventCount} events`,
            eventCount,
          ),
        };
      });
  }, [search, timelinesWithEvents]);

  const handleAdd = (keys: string[]) => {
    const wanted = new Set(keys.map(Number));
    const current = new Set(timelines.map((timeline) => timeline.id));

    const changed =
      wanted.size !== current.size ||
      keys.some((key) => !current.has(Number(key)));
    if (changed) {
      trackExplorationPlanEdited("manual", "timelines");
    }

    setTimelines((prev) => {
      const kept = prev.filter((timeline) => wanted.has(timeline.id));
      const keptIds = new Set(kept.map((timeline) => timeline.id));
      const added = allTimelines.filter(
        (timeline) => wanted.has(timeline.id) && !keptIds.has(timeline.id),
      );
      return [...kept, ...added];
    });
  };

  return (
    <AddEntitiesModal
      opened={opened}
      onClose={onClose}
      title={t`Add events to your research plan`}
      searchPlaceholder={t`Search for a timeline`}
      search={search}
      onSearchChange={setSearch}
      items={items}
      isLoading={timelinesLoading}
      error={timelinesError}
      onAdd={handleAdd}
      selectedKeys={selectedKeys}
      emptyState={
        hasTimelines ? undefined : (
          <Box mt="md">
            <TimelineEmptyState
              collection={timelineCollection}
              shouldOpenLinkInNewTab
            />
          </Box>
        )
      }
    />
  );
}
