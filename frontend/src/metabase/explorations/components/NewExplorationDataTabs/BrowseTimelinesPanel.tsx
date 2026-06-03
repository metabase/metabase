import { useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
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
  const {
    timelines: selectedTimelines,
    allTimelines,
    timelinesLoading,
    timelinesError,
    toggleTimeline,
  } = selection;

  const [search, setSearch] = useState("");

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
          loading={timelinesLoading}
          error={timelinesError}
          style={{ height: "100%" }}
        >
          <TimelineList
            timelines={filteredTimelines}
            selectedIds={selectedIds}
            onToggle={(timeline) => {
              trackExplorationPlanEdited("manual", "timelines");
              toggleTimeline(timeline);
            }}
          />
        </LoadingAndErrorWrapper>
      </Box>
    </Stack>
  );
}
