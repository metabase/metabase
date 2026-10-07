import type { Editor } from "@tiptap/react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { TimelineSidebar } from "metabase/timelines/questions/components/TimelineSidebar";
import { Box, Loader, Stack, Text } from "metabase/ui";
import { getTimelineEventSettings } from "metabase/viz-core";
import type {
  CollectionId,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";

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
  const selectedTimelineEventIds = useSelector(getSelectedTimelineEventIds);
  const focusedTimelineEventIds = useSelector(getFocusedTimelineEventIds);

  const {
    data: timelineData = [],
    isLoading,
    isError,
  } = useListTimelinesQuery({
    include: "events",
  });

  const timelines = useMemo(
    () => timelineData.filter((timeline) => (timeline.events?.length ?? 0) > 0),
    [timelineData],
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

  const visibleTimelineEventIds = useMemo(() => {
    const selectedTimelineIds = new Set(
      card?.visualization_settings["timeline.selected_timeline_ids"] ?? [],
    );
    const excludedTimelineEventIds = new Set(
      card?.visualization_settings["timeline.excluded_timeline_event_ids"] ??
        [],
    );

    return timelines.flatMap((timeline) => {
      if (!selectedTimelineIds.has(timeline.id)) {
        return [];
      }
      return (timeline.events ?? [])
        .filter((event) => !excludedTimelineEventIds.has(event.id))
        .map((event) => event.id);
    });
  }, [card, timelines]);

  const updateTimelineVizSettings = useCallback(
    (newTimelineEventIds: TimelineEventId[]) => {
      const draftId = ensureDraftCard({}, true);
      dispatch(
        updateVizSettings({
          cardId: draftId,
          settings: getTimelineEventSettings(timelines, newTimelineEventIds),
        }),
      );
    },
    [dispatch, ensureDraftCard, timelines],
  );

  const handleShowTimelineEvents = useCallback(
    (timelineEvents: TimelineEvent[]) => {
      const newVisibleTimelineEventIds = [
        ...visibleTimelineEventIds,
        ...timelineEvents.map((event) => event.id),
      ];
      updateTimelineVizSettings(newVisibleTimelineEventIds);
    },
    [updateTimelineVizSettings, visibleTimelineEventIds],
  );

  const handleHideTimelineEvents = useCallback(
    (timelineEvents: TimelineEvent[]) => {
      const eventIdsToHide = new Set(timelineEvents.map((event) => event.id));
      const newVisibleTimelineEventIds = visibleTimelineEventIds.filter(
        (eventId) => !eventIdsToHide.has(eventId),
      );
      updateTimelineVizSettings(newVisibleTimelineEventIds);
    },
    [updateTimelineVizSettings, visibleTimelineEventIds],
  );

  const handleClose = useCallback(() => {
    dispatch(closeSidebar());
  }, [dispatch]);

  const handleSelectTimelineEvents = useCallback(
    (timelineEvents: TimelineEvent[]) => {
      dispatch(selectTimelineEvents(timelineEvents));
    },
    [dispatch],
  );

  const handleDeselectTimelineEvents = useCallback(() => {
    dispatch(deselectTimelineEvents());
  }, [dispatch]);

  const handleShowAllEvents = useCallback(() => {
    dispatch(clearFocusedTimelineEvents());
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
        timelines={timelines}
        visibleTimelineEventIds={visibleTimelineEventIds}
        selectedTimelineEventIds={selectedTimelineEventIds}
        focusedTimelineEventIds={focusedTimelineEventIds}
        onShowTimelineEvents={handleShowTimelineEvents}
        onHideTimelineEvents={handleHideTimelineEvents}
        onSelectTimelineEvents={handleSelectTimelineEvents}
        onDeselectTimelineEvents={handleDeselectTimelineEvents}
        onShowAllEvents={handleShowAllEvents}
        onClose={handleClose}
      />
    </Box>
  );
}
