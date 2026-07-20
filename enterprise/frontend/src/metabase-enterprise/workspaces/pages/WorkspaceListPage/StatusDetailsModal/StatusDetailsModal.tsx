import { Modal } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { getStatusMessage } from "../../../utils";
import { StatusDetails } from "../StatusDetails";

export type StatusDetailsModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function StatusDetailsModal({
  workspace,
  opened,
  onClose,
}: StatusDetailsModalProps) {
  return (
    <Modal
      title={getStatusMessage(workspace.status)}
      opened={opened}
      padding="xl"
      size="lg"
      onClose={onClose}
    >
      {workspace.status_details != null && (
        <StatusDetails details={workspace.status_details} />
      )}
    </Modal>
  );
}
