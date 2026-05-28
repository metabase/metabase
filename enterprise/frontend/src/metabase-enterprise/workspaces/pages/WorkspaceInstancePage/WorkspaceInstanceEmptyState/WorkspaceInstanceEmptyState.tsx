import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Box, Button } from "metabase/ui";

import { trackWorkspaceSetupButtonClicked } from "../../../analytics";
import { WorkspaceEmptyState } from "../../../components/WorkspaceEmptyState";
import { SetupWorkspaceModal } from "../SetupWorkspaceModal";

export function WorkspaceInstanceEmptyState() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <WorkspaceEmptyState
        description={t`Set up this developer instance to remap transform tables into an isolated workspace schema, so you can develop and test transforms without affecting your production tables.`}
      >
        <Box pb="xl">
          <Button
            variant="filled"
            onClick={() => {
              trackWorkspaceSetupButtonClicked();
              open();
            }}
          >
            {t`Set up a workspace`}
          </Button>
        </Box>
      </WorkspaceEmptyState>
      <SetupWorkspaceModal opened={opened} onClose={close} />
    </>
  );
}
