import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, FixedSizeIcon, Tooltip } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { supportsWorkspaces } from "../../../../utils";
import { NewDatabaseModal } from "../NewDatabaseModal";

export type AddDatabaseButtonProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function AddDatabaseButton({
  workspace,
  availableDatabases,
}: AddDatabaseButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);

  const selectedIds = new Set(workspace.databases.map((db) => db.database_id));
  const selectableDatabases = availableDatabases.filter(
    (database) => !selectedIds.has(database.id),
  );
  const errorMessage = getErrorMessage(availableDatabases, selectableDatabases);
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
      <NewDatabaseModal
        workspace={workspace}
        availableDatabases={selectableDatabases}
        opened={opened}
        onCreate={close}
        onClose={close}
      />
    </>
  );
}

function getErrorMessage(
  availableDatabases: Database[],
  selectableDatabases: Database[],
): string | undefined {
  if (availableDatabases.length === 0) {
    return t`There are no databases available.`;
  }
  if (selectableDatabases.length === 0) {
    return t`There are no more databases available.`;
  }
  if (!selectableDatabases.some(supportsWorkspaces)) {
    return t`None of the remaining databases support workspaces.`;
  }
  return undefined;
}
