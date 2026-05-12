import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { Button, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database, Workspace } from "metabase-types/api";

import { NewWorkspaceModal } from "../NewWorkspaceModal";

export type NewWorkspaceButtonProps = {
  availableDatabases: Database[];
};

export function NewWorkspaceButton({
  availableDatabases,
}: NewWorkspaceButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const dispatch = useDispatch();
  const { sendSuccessToast } = useMetadataToasts();
  const hasAvailableDatabases = availableDatabases.length > 0;

  const handleCreate = (workspace: Workspace) => {
    sendSuccessToast(t`New workspace created`);
    close();
    dispatch(push(Urls.workspace(workspace.id)));
  };

  return (
    <>
      <Tooltip
        label={t`There are no databases that support workspaces.`}
        disabled={hasAvailableDatabases}
      >
        <Button
          disabled={!hasAvailableDatabases}
          leftSection={<Icon name="add" />}
          onClick={open}
        >
          {t`Add workspace`}
        </Button>
      </Tooltip>
      <NewWorkspaceModal
        opened={opened}
        onCreate={handleCreate}
        onClose={close}
      />
    </>
  );
}
