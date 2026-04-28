import { jt, t } from "ttag";

import { Box, Button, Code, Divider, Stack, Text } from "metabase/ui";

import type { WorkspaceInfo } from "../../../types";
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
  const configUrl = `/api/ee/workspace/${workspace.id}/config/yaml`;

  return (
    <TitleSection
      label={t`Setup a development instance`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only workspace management UI
      description={t`Spin up another Metabase instance configured with this workspace's isolated database credentials.`}
    >
      <Stack p="md" gap="sm">
        <Text>{t`Download the config file with isolated database credentials:`}</Text>
        <Box>
          <Button
            variant="filled"
            component="a"
            href={configUrl}
            download="config.yml"
          >
            {t`Download config file`}
          </Button>
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
