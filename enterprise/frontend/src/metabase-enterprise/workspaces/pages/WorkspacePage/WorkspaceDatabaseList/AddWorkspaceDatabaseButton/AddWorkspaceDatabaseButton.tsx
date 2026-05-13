import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, FixedSizeIcon, Tooltip } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

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
  const hasAvailableDatabases = availableDatabases.length > 0;
  const isEmpty = workspace.databases.length === 0;

  return (
    <>
      <Tooltip
        label={t`There are no more databases available.`}
        disabled={hasAvailableDatabases}
      >
        <Button
          variant={isEmpty ? "filled" : "default"}
          disabled={!hasAvailableDatabases}
          leftSection={<FixedSizeIcon name="add" />}
          onClick={open}
        >
          {isEmpty ? t`Add database` : t`Add another database`}
        </Button>
      </Tooltip>
      <NewWorkspaceDatabaseModal
        workspace={workspace}
        availableDatabases={availableDatabases}
        opened={opened}
        onCreate={close}
        onClose={close}
      />
    </>
  );
}
