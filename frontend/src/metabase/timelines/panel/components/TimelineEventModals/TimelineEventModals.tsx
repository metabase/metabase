import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetTimelineEventQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Modal } from "metabase/ui";
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

const getModalLabel = (type: TimelineEventModalState["type"]) =>
  ({
    new: t`New event`,
    edit: t`Edit event`,
    move: t`Move event`,
  })[type];

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
  // The edit/move containers render nothing until the event arrives, so this
  // query's error is shown in their place.
  const { error } = useGetTimelineEventQuery(
    modal && modal.type !== "new" ? modal.eventId : skipToken,
  );

  if (!modal) {
    return null;
  }

  if (error) {
    return (
      <Modal
        opened
        size="lg"
        title={getModalLabel(modal.type)}
        onClose={onClose}
      >
        <LoadingAndErrorWrapper loading={false} error={error} />
      </Modal>
    );
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
