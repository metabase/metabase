import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetTimelineEventQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import EditEventModal from "metabase/timelines/panel/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/panel/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/panel/containers/NewEventModal";
import { Modal } from "metabase/ui";
import type { CollectionId, TimelineEventId } from "metabase-types/api";

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
  onClose,
}: {
  modal: TimelineEventModalState | null;
  collectionId: CollectionId | null;
  onClose: () => void;
}) {
  // The edit/move containers render nothing until the event arrives, so the
  // modal shows this query's loading and error states instead of a blank box.
  const { isLoading, error } = useGetTimelineEventQuery(
    modal && modal.type !== "new" ? modal.eventId : skipToken,
  );

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
      aria-label={getModalLabel(modal.type)}
    >
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {content}
      </LoadingAndErrorWrapper>
    </Modal>
  );
}
