import { jt, t } from "ttag";

import { Box, Button, Code, Divider, Stack, Text, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";

import type { WorkspaceInfo } from "../../../types";
import { isDatabaseProvisioned } from "../../../utils";
import { TitleSection } from "../TitleSection";

const DOCKER_COMMAND = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_PREMIUM_EMBEDDING_TOKEN=<token> \\
  metabase/metabase-enterprise:latest`;

type SetupSectionProps = {
  workspace: WorkspaceInfo;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  const workspaceId = workspace.id;
  if (workspaceId == null) {
    return null;
  }

  const configUrl = `/api/ee/workspace/${workspaceId}/config/yaml`;
  const isProvisioned = workspace.databases.every(isDatabaseProvisioned);

  return (
    <TitleSection
      label={t`Setup a development instance`}
      description={t`Load the config on another instance to configure its databases with isolated credentials.`}
    >
      <Stack p="md" gap="sm">
        <Text>{t`Download the config file with isolated database credentials:`}</Text>
        <Box>
          {isProvisioned ? (
            <Button
              variant="filled"
              component="a"
              href={configUrl}
              download="config.yml"
            >
              {t`Download config file`}
            </Button>
          ) : (
            <Tooltip
              label={t`Provision the workspace before downloading the config.`}
              openDelay={TOOLTIP_OPEN_DELAY}
            >
              <Button variant="filled" disabled>
                {t`Download config file`}
              </Button>
            </Tooltip>
          )}
        </Box>
      </Stack>
      <Divider />
      <Stack p="md" gap="sm">
        <Text>
          {jt`Use ${<Code key="env">MB_CONFIG_FILE_PATH</Code>} to setup a developer instance:`}
        </Text>
        <Code block>{DOCKER_COMMAND}</Code>
      </Stack>
    </TitleSection>
  );
}
