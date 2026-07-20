import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, FixedSizeIcon, Tooltip } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { getEligibleDatabases } from "../../../utils";
import { NewWorkspaceModal } from "../NewWorkspaceModal";

export type NewWorkspaceButtonProps = {
  databases: Database[];
  primary?: boolean;
};

export function NewWorkspaceButton({
  databases,
  primary,
}: NewWorkspaceButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);

  const eligibleDatabases = getEligibleDatabases(databases);
  const hasEligibleDatabase = eligibleDatabases.length > 0;

  return (
    <>
      <Tooltip
        label={t`You need to enable workspaces on at least one database.`}
        disabled={hasEligibleDatabase}
      >
        <Button
          variant={primary ? "filled" : "default"}
          leftSection={
            primary ? undefined : <FixedSizeIcon name="add" aria-hidden />
          }
          disabled={!hasEligibleDatabase}
          onClick={open}
        >
          {primary ? t`Create a workspace` : t`New`}
        </Button>
      </Tooltip>
      <NewWorkspaceModal
        databases={eligibleDatabases}
        opened={opened}
        onCreate={close}
        onClose={close}
      />
    </>
  );
}
