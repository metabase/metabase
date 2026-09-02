import type { Editor } from "@tiptap/react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { TimelineSidebar } from "metabase/timelines/panel/components/TimelineSidebar";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import { getNonEmptyTimelines } from "metabase/timelines/panel/utils";
import { Box, Loader, Stack, Text } from "metabase/ui";
import {
  hideTimelineEvents,
  hideTimelines,
  isSameTimelineEventsVisibility,
  resolveVisibleTimelineEvents,
  showCreatedTimelineEvent,
  showTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { CollectionId, Timeline, TimelineEvent } from "metabase-types/api";

import {
  clearFocusedTimelineEvents,
  closeSidebar,
  deselectTimelineEvents,
  selectTimelineEvents,
  updateVizSettings,
} from "../documents.slice";
import { useCardData } from "../hooks/use-card-data";
import { useDraftCardOperations } from "../hooks/use-draft-card-operations";
import {
  getFocusedTimelineEventIds,
  getSelectedTimelineEventIds,
} from "../selectors";

import S from "./EmbedTimelineSidebar.module.css";

interface EmbedTimelineSidebarProps {
  cardId: number;
  selectedEmbedIndex: number;
  editorInstance?: Editor;
  collectionId: CollectionId | null;
}

export function EmbedTimelineSidebar({
  cardId,
  selectedEmbedIndex,
  editorInstance,
  collectionId,
}: EmbedTimelineSidebarProps) {
  const dispatch = useDispatch();
  const selectedEventIds = useSelector(getSelectedTimelineEventIds);
  const focusedEventIds = useSelector(getFocusedTimelineEventIds);

  const { isLoading, isError } = useListTimelinesQuery({ include: "events" });
  const timelines = useSelector(getTransformedTimelines);
  const displayedTimelines = useMemo(
    () => getNonEmptyTimelines(timelines),
    [timelines],
  );

  const { card, draftCard, regularDataset } = useCardData({
    id: cardId,
  });

  const { ensureDraftCard } = useDraftCardOperations(
    draftCard,
    card,
    cardId,
    editorInstance,
    selectedEmbedIndex,
    regularDataset,
  );

  const visibility = card?.visualization_settings;
  const visibleEventIds = useMemo(
    () =>
      resolveVisibleTimelineEvents({ timelines, visibility }).map(
        (event) => event.id,
      ),
    [timelines, visibility],
  );

  const updateVisibility = useCallback(
    (update: TimelineEventsVisibilityUpdate) => {
      const nextVisibility = update(visibility ?? {}, timelines);
      if (isSameTimelineEventsVisibility(visibility, nextVisibility)) {
        return;
      }
      const draftId = ensureDraftCard({}, true);
      dispatch(
        updateVizSettings({ cardId: draftId, settings: nextVisibility }),
      );
    },
    [dispatch, ensureDraftCard, visibility, timelines],
  );

  const handleShowTimelineEvents = useCallback(
    (events: TimelineEvent[]) =>
      updateVisibility((visibility, timelines) =>
        showTimelineEvents(visibility, events, timelines),
      ),
    [updateVisibility],
  );

  const handleHideTimelineEvents = useCallback(
    (events: TimelineEvent[]) =>
      updateVisibility((visibility, timelines) =>
        hideTimelineEvents(visibility, events, timelines),
      ),
    [updateVisibility],
  );

  const handleShowTimeline = useCallback(
    (timeline: Timeline) =>
      updateVisibility((visibility, timelines) =>
        showTimelines(visibility, [timeline.id], timelines),
      ),
    [updateVisibility],
  );

  const handleHideTimeline = useCallback(
    (timeline: Timeline) =>
      updateVisibility((visibility, timelines) =>
        hideTimelines(visibility, [timeline.id], timelines),
      ),
    [updateVisibility],
  );

  const handleEventCreated = useCallback(
    (event: TimelineEvent) =>
      updateVisibility((visibility, timelines) =>
        showCreatedTimelineEvent(visibility, event, timelines),
      ),
    [updateVisibility],
  );

  const handleSelectEvents = useCallback(
    (events: TimelineEvent[]) => {
      dispatch(selectTimelineEvents(events));
    },
    [dispatch],
  );

  const handleDeselectEvents = useCallback(() => {
    dispatch(deselectTimelineEvents());
  }, [dispatch]);

  const handleShowAllEvents = useCallback(() => {
    dispatch(clearFocusedTimelineEvents());
  }, [dispatch]);

  const handleClose = useCallback(() => {
    dispatch(closeSidebar());
  }, [dispatch]);

  if (isLoading) {
    return (
      <Stack gap="xl" p="xl" className={S.loadingContainer}>
        <Box className={S.loadingContent}>
          <Loader size="lg" />
          <Text>{t`Loading timeline events...`}</Text>
        </Box>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Stack gap="xl" p="xl" className={S.errorContainer}>
        <Box className={S.errorContent}>
          <Text c="error">{t`Failed to load timeline events`}</Text>
        </Box>
      </Stack>
    );
  }

  return (
    <Box className={S.container}>
      <TimelineSidebar
        collectionId={collectionId}
        timelines={displayedTimelines}
        visibleEventIds={visibleEventIds}
        selectedEventIds={selectedEventIds}
        focusedEventIds={focusedEventIds}
        onShowTimelineEvents={handleShowTimelineEvents}
        onHideTimelineEvents={handleHideTimelineEvents}
        onShowTimeline={handleShowTimeline}
        onHideTimeline={handleHideTimeline}
        onSelectEvents={handleSelectEvents}
        onDeselectEvents={handleDeselectEvents}
        onEventCreated={handleEventCreated}
        onShowAllEvents={handleShowAllEvents}
        onClose={handleClose}
      />
    </Box>
  );
}
