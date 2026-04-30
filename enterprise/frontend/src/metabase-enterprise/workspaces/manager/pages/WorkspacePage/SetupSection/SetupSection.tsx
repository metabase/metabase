import { jt, t } from "ttag";

import { Anchor, Button, Code, Divider, Stack, Text } from "metabase/ui";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace } from "metabase-types/api";

const LOCAL_INSTANCE_URL = "http://localhost:3000";
const CONFIG_FILE_NAME = "config.yml";

type SetupSectionProps = {
  workspace: Workspace;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  return (
    <TitleSection
      label={t`Set up a development instance`}
      description={t`Run a local instance backed by this workspace's data, so you can iterate on changes safely.`}
    >
      <DownloadConfigSection workspace={workspace} />
      <Divider />
      <RunInstanceSection />
    </TitleSection>
  );
}

type DownloadConfigSectionProps = {
  workspace: Workspace;
};

function DownloadConfigSection({ workspace }: DownloadConfigSectionProps) {
  const configUrl = `/api/ee/workspace-manager/${workspace.id}/config/yaml`;

  return (
    <Stack p="md" gap="sm" align="flex-start">
      <Text>
        {jt`Download the workspace's ${<Code key="cfg">{CONFIG_FILE_NAME}</Code>} file. It contains the isolated database credentials:`}
      </Text>
      <Button component="a" href={configUrl} download="config.yml">
        {t`Download config.yml`}
      </Button>
    </Stack>
  );
}

function RunInstanceSection() {
  const dockerCommand = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_PREMIUM_EMBEDDING_TOKEN \\
  metabase/metabase-enterprise:latest`;

  return (
    <Stack p="md" gap="sm">
      <Text>
        {jt`Start the developer instance at ${(
          <Anchor
            key="url"
            href={LOCAL_INSTANCE_URL}
            target="_blank"
            rel="noreferrer"
          >
            {LOCAL_INSTANCE_URL}
          </Anchor>
        )}:`}
      </Text>
      <Code block>{dockerCommand}</Code>
    </Stack>
  );
}
