import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Box, Modal } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { getStatusMessage } from "../../../utils";

import S from "./StatusDetailsModal.module.css";

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
      <Box className={S.codeContainer}>
        <CodeEditor value={workspace.status_details ?? ""} readOnly />
      </Box>
    </Modal>
  );
}
