import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { Box, Icon, Stack, TextInput } from "metabase/ui";

import {
  TimelineList,
  filterTimelinesBySearch,
} from "../NewExplorationData/TimelineList";

import S from "./NewExplorationLeftTabs.module.css";

export interface BrowseTimelinesPanelProps {
  selection: ExplorationSelection;
}

export function BrowseTimelinesPanel({ selection }: BrowseTimelinesPanelProps) {
  const { timelines: selectedTimelines, toggleTimeline } = selection;

  const [search, setSearch] = useState("");

  const {
    data: allTimelines = [],
    isLoading,
    error,
  } = useListTimelinesQuery({ include: "events" });

  const filteredTimelines = useMemo(() => {
    const timelinesWithEvents = allTimelines.filter(
      (t) => (t.events?.length ?? 0) > 0,
    );
    return filterTimelinesBySearch(timelinesWithEvents, search);
  }, [allTimelines, search]);

  const selectedIds = useMemo(
    () => new Set(selectedTimelines.map((t) => t.id)),
    [selectedTimelines],
  );

  return (
    <Stack className={S.browsePanel} data-testid="browse-panel">
      <TextInput
        className={S.browseSearch}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder={t`Search for a timeline`}
        leftSection={<Icon name="search" />}
      />
      <Box className={S.browseList}>
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={error}
          style={{ height: "100%" }}
        >
          <TimelineList
            timelines={filteredTimelines}
            selectedIds={selectedIds}
            onToggle={toggleTimeline}
          />
        </LoadingAndErrorWrapper>
      </Box>
    </Stack>
  );
}
