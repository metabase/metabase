import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Modal } from "metabase/ui";
import { useGetWorkspaceConfigQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import S from "./WorkspaceConfigModal.module.css";

type WorkspaceConfigModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function WorkspaceConfigModal({
  workspace,
  opened,
  onClose,
}: WorkspaceConfigModalProps) {
  return (
    <Modal
      title={t`Configuration file`}
      size="xl"
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <WorkspaceConfigModalBody workspace={workspace} />
    </Modal>
  );
}

type WorkspaceConfigModalBodyProps = {
  workspace: Workspace;
};

function WorkspaceConfigModalBody({
  workspace,
}: WorkspaceConfigModalBodyProps) {
  const {
    data: config,
    isLoading,
    error,
  } = useGetWorkspaceConfigQuery(workspace.id);

  if (isLoading || error != null || config == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const code = JSON.stringify(config, null, 2);

  return (
    <Box className={S.codeContainer} pos="relative" pr="lg">
      <CodeEditor language="json" value={code} readOnly />
      <Box p="sm" pos="absolute" right={0} top={0}>
        <CopyButton value={code} />
      </Box>
    </Box>
  );
}
