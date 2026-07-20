import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
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
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled") ?? false;

  const eligibleDatabases = getEligibleDatabases(databases);
  const hasEligibleDatabase = eligibleDatabases.length > 0;
  const canCreateWorkspace = hasEligibleDatabase && isRemoteSyncEnabled;

  return (
    <>
      <Tooltip
        label={
          hasEligibleDatabase
            ? t`You need to set up remote sync.`
            : t`You need to enable workspaces on at least one database.`
        }
        disabled={canCreateWorkspace}
      >
        <Button
          variant={primary ? "filled" : "default"}
          leftSection={
            primary ? undefined : <FixedSizeIcon name="add" aria-hidden />
          }
          disabled={!canCreateWorkspace}
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
