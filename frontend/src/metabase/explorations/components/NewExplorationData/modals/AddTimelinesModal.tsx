import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import type { ExplorationSelection } from "metabase/explorations/hooks";

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
  const { allTimelines, timelinesLoading, timelinesError, addTimelinesById } =
    selection;

  const [search, setSearch] = useState("");

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
    addTimelinesById(keys.map(Number));
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
    />
  );
}
