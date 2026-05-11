import type { Editor } from "@tiptap/react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { TimelineSidebar } from "metabase/query_builder/components/view/sidebars/TimelineSidebar";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import { useDispatch } from "metabase/redux";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal/NewEventModal";
import { Box, Loader, Modal, Stack, Text } from "metabase/ui";
import { getTimelineEventSettings } from "metabase/visualizations/lib/settings/timelineEvents";
import type {
  CollectionId,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";

import { closeSidebar, updateVizSettings } from "../documents.slice";
import { useCardData } from "../hooks/use-card-data";
import { useDraftCardOperations } from "../hooks/use-draft-card-operations";

import S from "./TimelineEventsSidebar.module.css";

interface TimelineEventsSidebarProps {
  cardId: number;
  selectedEmbedIndex: number;
  editorInstance?: Editor;
  collectionId: CollectionId | null;
}

export function TimelineEventsSidebar({
  cardId,
  selectedEmbedIndex,
  editorInstance,
  collectionId,
}: TimelineEventsSidebarProps) {
  const [isShowNewEventModal, setIsShowNewEventModal] = useState(false);

  const dispatch = useDispatch();

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
      const cardId = ensureDraftCard({}, true);
      dispatch(
        updateVizSettings({
          cardId,
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

  const handleOpenModal = useCallback((modal: QueryModalType) => {
    if (modal === MODAL_TYPES.NEW_EVENT) {
      setIsShowNewEventModal(true);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsShowNewEventModal(false);
  }, []);

  if (isLoading) {
    return (
      <Stack gap="lg" p="lg" className={S.loadingContainer}>
        <Box className={S.loadingContent}>
          <Loader size="lg" />
          <Text>{t`Loading timeline events...`}</Text>
        </Box>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Stack gap="lg" p="lg" className={S.errorContainer}>
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
        selectedTimelineEventIds={[]}
        onShowTimelineEvents={handleShowTimelineEvents}
        onHideTimelineEvents={handleHideTimelineEvents}
        onClose={handleClose}
        onOpenModal={handleOpenModal}
      />
      {isShowNewEventModal && (
        <Modal
          opened
          onClose={handleCloseModal}
          withCloseButton={false}
          padding="0"
        >
          <NewEventModal
            collectionId={collectionId}
            onClose={handleCloseModal}
          />
        </Modal>
      )}
    </Box>
  );
}
