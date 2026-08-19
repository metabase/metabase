import { match } from "ts-pattern";

import EditEventModal from "metabase/timelines/panel/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/panel/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/panel/containers/NewEventModal";
import { Modal } from "metabase/ui";
import type { CollectionId, TimelineEventId } from "metabase-types/api";

export type TimelineEventModalState =
  | { type: "new" }
  | { type: "edit"; eventId: TimelineEventId }
  | { type: "move"; eventId: TimelineEventId };

export function TimelineEventModals({
  modal,
  collectionId,
  onClose,
}: {
  modal: TimelineEventModalState | null;
  collectionId: CollectionId | null;
  onClose: () => void;
}) {
  if (!modal) {
    return null;
  }

  const content = match(modal)
    .with({ type: "new" }, () => (
      <NewEventModal collectionId={collectionId} onClose={onClose} />
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

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      padding={0}
    >
      {content}
    </Modal>
  );
}
