import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, FixedSizeIcon, Tooltip } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { supportsWorkspaces } from "../../../../utils";
import { NewWorkspaceDatabaseModal } from "../NewWorkspaceDatabaseModal";

export type AddWorkspaceDatabaseButtonProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function AddWorkspaceDatabaseButton({
  workspace,
  availableDatabases,
}: AddWorkspaceDatabaseButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);

  const selectedIds = new Set(workspace.databases.map((db) => db.database_id));
  const selectableDatabases = availableDatabases.filter(
    (database) => !selectedIds.has(database.id),
  );
  const errorMessage = getErrorMessage(selectableDatabases);
  const isDisabled = errorMessage != null;
  const isEmpty = workspace.databases.length === 0;

  return (
    <>
      <Tooltip label={errorMessage} disabled={!isDisabled}>
        <Button
          variant={isEmpty ? "filled" : "default"}
          disabled={isDisabled}
          leftSection={<FixedSizeIcon name="add" />}
          onClick={open}
        >
          {isEmpty ? t`Add database` : t`Add another database`}
        </Button>
      </Tooltip>
      <NewWorkspaceDatabaseModal
        workspace={workspace}
        availableDatabases={selectableDatabases}
        opened={opened}
        onCreate={close}
        onClose={close}
      />
    </>
  );
}

function getErrorMessage(databases: Database[]): string | undefined {
  if (databases.length === 0) {
    return t`There are no more databases available.`;
  }
  if (!databases.some(supportsWorkspaces)) {
    return t`None of the remaining databases support workspaces.`;
  }
  return undefined;
}
