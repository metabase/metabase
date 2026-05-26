import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { Box, Button } from "metabase/ui";

import { WorkspaceEmptyState } from "../../../components/WorkspaceEmptyState";
import { getIsDevelopmentMode } from "../../../selectors";
import { SetupWorkspaceModal } from "../SetupWorkspaceModal";

export function WorkspaceInstanceEmptyState() {
  const [opened, { open, close }] = useDisclosure(false);
  const isDevelopmentMode = useSelector(getIsDevelopmentMode);

  return (
    <>
      <WorkspaceEmptyState
        description={t`Set up this developer instance to remap transform tables into an isolated workspace schema, so you can develop and test transforms without affecting your production tables.`}
      >
        {isDevelopmentMode && (
          <Box pb="xl">
            <Button variant="filled" onClick={open}>
              {t`Set up a workspace`}
            </Button>
          </Box>
        )}
      </WorkspaceEmptyState>
      <SetupWorkspaceModal opened={opened} onClose={close} />
    </>
  );
}
