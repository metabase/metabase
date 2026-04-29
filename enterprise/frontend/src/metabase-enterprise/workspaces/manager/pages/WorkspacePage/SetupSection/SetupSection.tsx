import { jt, t } from "ttag";

import { Box, Button, Code, Divider, Stack, Text, Tooltip } from "metabase/ui";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace } from "metabase-types/api";

const DOCKER_COMMAND = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_PREMIUM_EMBEDDING_TOKEN=<token> \\
  metabase/metabase-enterprise:latest`;

type SetupSectionProps = {
  workspace: Workspace;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  const configUrl = `/api/ee/workspace-manager/${workspace.id}/config/yaml`;
  const hasDatabases = workspace.databases.length > 0;

  return (
    <TitleSection
      label={t`Setup a development instance`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only workspace management UI
      description={t`Spin up another Metabase instance configured with this workspace's isolated database credentials.`}
    >
      <Stack p="md" gap="sm">
        <Text>{t`Download the config file with isolated database credentials:`}</Text>
        <Box>
          {hasDatabases ? (
            <Button
              variant="filled"
              component="a"
              href={configUrl}
              download="config.yml"
            >
              {t`Download config file`}
            </Button>
          ) : (
            <Tooltip label={t`No databases configured yet.`}>
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
