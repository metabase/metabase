import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils/settings";
import { Box, Button, Tooltip } from "metabase/ui";

import { trackWorkspaceSetupButtonClicked } from "../../../analytics";
import { WorkspaceEmptyState } from "../../../components/WorkspaceEmptyState";
import { SetupWorkspaceModal } from "../SetupWorkspaceModal";

export function WorkspaceInstanceEmptyState() {
  const [opened, { open, close }] = useDisclosure(false);
  const { settingDetails } = useAdminSetting("instance-workspace");
  const isSetViaEnv = settingDetails != null && settingDetails.is_env_setting;

  return (
    <>
      <WorkspaceEmptyState
        description={t`Set up this developer instance to remap transform tables into an isolated workspace schema, so you can develop and test transforms without affecting your production tables.`}
      >
        <Box pb="xl">
          <Tooltip
            label={t`This instance's workspace is set via the ${settingDetails?.env_name} environment variable.`}
            disabled={!isSetViaEnv}
          >
            <Button
              variant="filled"
              disabled={isSetViaEnv}
              onClick={() => {
                trackWorkspaceSetupButtonClicked();
                open();
              }}
            >
              {t`Set up a workspace`}
            </Button>
          </Tooltip>
        </Box>
      </WorkspaceEmptyState>
      <SetupWorkspaceModal opened={opened} onClose={close} />
    </>
  );
}
