import { Modal } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { getStatusMessage } from "../../../utils";
import { StatusDetails } from "../StatusDetails";

export type ErrorModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function ErrorModal({ workspace, opened, onClose }: ErrorModalProps) {
  return (
    <Modal
      title={getStatusMessage(workspace.status)}
      opened={opened}
      padding="xl"
      size="lg"
      onClose={onClose}
    >
      <StatusDetails details={workspace.status_details ?? ""} />
    </Modal>
  );
}
