import { ModalContent } from "metabase/common/components/ModalContent";
import {
  LoadingSkeleton,
  TextSkeleton,
} from "metabase/common/components/Skeletons";
import { Modal, Skeleton } from "metabase/ui";

const TITLE_HEIGHT = 20;
const BUTTON_HEIGHT = 32;

type NotificationModalSkeletonProps = {
  /** Number of lines in the modal's message. */
  lines?: number;
  onClose: () => void;
};

/**
 * Stands in for a `ModalContent`-based confirmation while the notification it
 * acts on loads, inside the `<Modal>` that `modalRoute` provides.
 */
export function NotificationModalContentSkeleton({
  lines = 2,
  onClose,
}: NotificationModalSkeletonProps) {
  return (
    <LoadingSkeleton gap={0}>
      <ModalContent
        title={<Skeleton h={TITLE_HEIGHT} w={280} radius="xs" />}
        footer={[
          <Skeleton key="cancel" h={BUTTON_HEIGHT} w={140} radius="sm" />,
          <Skeleton key="submit" h={BUTTON_HEIGHT} w={180} radius="sm" />,
        ]}
        onClose={onClose}
      >
        <TextSkeleton lines={lines} lineHeight={14} />
      </ModalContent>
    </LoadingSkeleton>
  );
}

/**
 * Stands in for a confirmation modal that brings its own `<Modal>`, while the
 * notification it acts on loads.
 */
export function NotificationConfirmModalSkeleton({
  lines = 1,
  onClose,
}: NotificationModalSkeletonProps) {
  return (
    <Modal
      opened
      size="lg"
      title={<Skeleton h={TITLE_HEIGHT} w={240} radius="xs" />}
      onClose={onClose}
    >
      <LoadingSkeleton gap={0}>
        <TextSkeleton lines={lines} lineHeight={14} />
        <Modal.Footer>
          <Skeleton h={BUTTON_HEIGHT} w={80} radius="sm" />
          <Skeleton h={BUTTON_HEIGHT} w={110} radius="sm" />
        </Modal.Footer>
      </LoadingSkeleton>
    </Modal>
  );
}
