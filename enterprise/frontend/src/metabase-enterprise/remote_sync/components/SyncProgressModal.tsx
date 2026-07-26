import { Modal } from "metabase/ui";

import {
  SyncProgressView,
  type SyncProgressViewProps,
  getSyncProgressShowCloseButton,
  getSyncProgressTitle,
} from "./SyncProgressView";

type SyncProgressModalProps = SyncProgressViewProps;

export function SyncProgressModal(props: SyncProgressModalProps) {
  const { taskType, isError, isSuccess, onDismiss } = props;

  return (
    <Modal
      onClose={onDismiss}
      opened
      size="md"
      title={getSyncProgressTitle({ taskType, isError, isSuccess })}
      withCloseButton={getSyncProgressShowCloseButton({ isError, isSuccess })}
    >
      <SyncProgressView {...props} />
    </Modal>
  );
}
