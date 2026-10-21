import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetTimelineEventQuery } from "metabase/api";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import type {
  CollectionId,
  TimelineEvent,
  TimelineEventId,
  TimelineEventSource,
} from "metabase-types/api";

import EditEventModal from "../../containers/EditEventModal";
import MoveEventModal from "../../containers/MoveEventModal";
import NewEventModal from "../../containers/NewEventModal";

export type TimelineEventModalState =
  | { type: "new" }
  | { type: "edit"; eventId: TimelineEventId }
  | { type: "move"; eventId: TimelineEventId };

const getTitle = (
  type: TimelineEventModalState["type"],
  event: TimelineEvent | undefined,
) =>
  match(type)
    .with("new", () => t`New event`)
    .with("edit", () => t`Edit event`)
    .with("move", () => (event ? t`Move ${event.name}` : undefined))
    .exhaustive();

export function TimelineEventModals({
  modal,
  collectionId,
  source,
  onEventCreated,
  onClose,
}: {
  modal: TimelineEventModalState | null;
  collectionId: CollectionId | null | undefined;
  source?: TimelineEventSource;
  onEventCreated?: (event: TimelineEvent) => void;
  onClose: () => void;
}) {
  const {
    data: event,
    isLoading,
    error,
  } = useGetTimelineEventQuery(
    modal && modal.type !== "new" ? modal.eventId : skipToken,
  );

  if (!modal) {
    return null;
  }

  const isLoadingEvent = modal.type !== "new" && (isLoading || !!error);

  return (
    <TimelineModal
      title={getTitle(modal.type, event)}
      density={modal.type === "move" ? undefined : "relaxed"}
      tall={isLoadingEvent || modal.type === "move"}
      onClose={onClose}
    >
      {isLoadingEvent ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <TimelineEventModalContent
          modal={modal}
          collectionId={collectionId}
          source={source}
          onEventCreated={onEventCreated}
          onClose={onClose}
        />
      )}
    </TimelineModal>
  );
}

function TimelineEventModalContent({
  modal,
  collectionId,
  source,
  onEventCreated,
  onClose,
}: {
  modal: TimelineEventModalState;
  collectionId: CollectionId | null | undefined;
  source?: TimelineEventSource;
  onEventCreated?: (event: TimelineEvent) => void;
  onClose: () => void;
}) {
  return match(modal)
    .with({ type: "new" }, () => (
      <NewEventModal
        collectionId={collectionId}
        source={source}
        onEventCreated={onEventCreated}
        onClose={onClose}
      />
    ))
    .with({ type: "edit" }, ({ eventId }) => (
      <EditEventModal eventId={eventId} onClose={onClose} />
    ))
    .with({ type: "move" }, ({ eventId }) => (
      <MoveEventModal
        eventId={eventId}
        collectionId={collectionId}
        onClose={onClose}
      />
    ))
    .exhaustive();
}
