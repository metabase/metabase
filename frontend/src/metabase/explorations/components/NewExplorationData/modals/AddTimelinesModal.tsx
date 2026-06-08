import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/collections/constants";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import TimelineEmptyState from "metabase/timelines/collections/components/TimelineEmptyState";

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
  } = selection;

  const [search, setSearch] = useState("");

  const hasTimelines = allTimelines.length > 0;
  const showEmptyState = opened && !hasTimelines;
  const { data: rootCollection } = useGetCollectionQuery(
    showEmptyState ? { id: ROOT_COLLECTION.id } : skipToken,
  );

  const selectedKeys = useMemo(
    () => new Set(timelines.map((timeline) => String(timeline.id))),
    [timelines],
  );

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (
      allTimelines
        // The picker only surfaces timelines that have at least one event.
        .filter((timeline) => (timeline.events?.length ?? 0) > 0)
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
        })
    );
  }, [allTimelines, search]);

  const handleAdd = (keys: string[]) => {
    const wanted = new Set(keys.map(Number));
    const current = new Set(timelines.map((timeline) => timeline.id));
    for (const id of wanted) {
      if (!current.has(id)) {
        trackExplorationPlanEdited("manual", "timelines");
      }
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
          <TimelineEmptyState collection={rootCollection} />
        )
      }
    />
  );
}
