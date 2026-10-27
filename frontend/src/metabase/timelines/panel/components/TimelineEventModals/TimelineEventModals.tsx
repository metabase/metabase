import { match } from "ts-pattern";

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
  if (!modal) {
    return null;
  }

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
