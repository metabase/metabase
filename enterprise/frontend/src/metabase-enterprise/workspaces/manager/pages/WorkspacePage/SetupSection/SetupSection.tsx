import { jt, t } from "ttag";

import { Anchor, Button, Code, Divider, Group, Stack, Text } from "metabase/ui";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace } from "metabase-types/api";

const LOCAL_INSTANCE_URL = "http://localhost:3000";
const CONFIG_FILE_NAME = "config.yml";
const METADATA_DIR_NAME = ".metadata/";
const PASSWORD_ENV_VAR = "MB_WORKSPACE_USER_PASSWORD";

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
      <ExportEnvVarsSection workspace={workspace} />
      <Divider />
      <RunInstanceSection />
      <Divider />
      <UsageCommentsSection workspace={workspace} />
    </TitleSection>
  );
}

type DownloadConfigSectionProps = {
  workspace: Workspace;
};

function DownloadConfigSection({ workspace }: DownloadConfigSectionProps) {
  const configUrl = `/api/ee/workspace-manager/${workspace.id}/config/yaml`;
  const metadataUrl = `/api/ee/workspace-manager/${workspace.id}/table-metadata/json`;
  const fieldValuesUrl = `/api/ee/workspace-manager/${workspace.id}/field-values/json`;

  return (
    <Stack p="md" gap="lg" align="flex-start">
      <Stack gap="sm" align="flex-start">
        <Text>
          {jt`Download the workspace's ${<Code key="cfg">{CONFIG_FILE_NAME}</Code>} file. It contains the isolated database credentials:`}
        </Text>
        <Button component="a" href={configUrl} download="config.yml">
          {t`Download config.yml`}
        </Button>
      </Stack>
      <Stack gap="sm" align="flex-start">
        <Text>
          {jt`Download table metadata into the ${<Code key="dir">{METADATA_DIR_NAME}</Code>} folder to skip syncing the database in the development instance and help a coding agent understand the schema:`}
        </Text>
        <Group gap="sm">
          <Button
            component="a"
            href={metadataUrl}
            download="table_metadata.json"
          >
            {t`Download table_metadata.json`}
          </Button>
          <Button
            component="a"
            href={fieldValuesUrl}
            download="field_values.json"
          >
            {t`Download field_values.json`}
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}

type ExportEnvVarsSectionProps = {
  workspace: Workspace;
};

function ExportEnvVarsSection({ workspace }: ExportEnvVarsSectionProps) {
  const hasCreator = workspace.creator != null;
  const envVars = hasCreator
    ? "MB_PREMIUM_EMBEDDING_TOKEN=\nMB_WORKSPACE_USER_PASSWORD="
    : "MB_PREMIUM_EMBEDDING_TOKEN=";
  const description = hasCreator
    ? t`Export the license token and the default user password:`
    : t`Export the license token:`;

  return (
    <Stack p="md" gap="sm">
      <Text>{description}</Text>
      <Code block>{envVars}</Code>
    </Stack>
  );
}

function RunInstanceSection() {
  const dockerCommand = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -v $(pwd)/.metadata:/.metadata \\
  -v $(pwd)/.git:/workspace/.git \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_REMOTE_SYNC_URL=file:///workspace/.git \\
  -e MB_TABLE_METADATA_PATH=/.metadata/table_metadata.json \\
  -e MB_FIELD_VALUES_PATH=/.metadata/field_values.json \\
  -e MB_PREMIUM_EMBEDDING_TOKEN \\
  -e MB_WORKSPACE_USER_PASSWORD \\
  metabase/metabase-enterprise:latest`;

  return (
    <Stack p="md" gap="sm">
      <Text>
        {jt`In the root of the repository synced with this instance, start the developer instance at ${(
          <Anchor
            key="url"
            href={LOCAL_INSTANCE_URL}
            target="_blank"
            rel="noreferrer"
          >
            {LOCAL_INSTANCE_URL}
          </Anchor>
        )}.`}
      </Text>
      <Code block>{dockerCommand}</Code>
    </Stack>
  );
}

type UsageCommentsSectionProps = {
  workspace: Workspace;
};

function UsageCommentsSection({ workspace }: UsageCommentsSectionProps) {
  const creatorEmail = workspace.creator?.email;

  return (
    <Stack p="md" gap="sm">
      {creatorEmail != null && (
        <Text>
          {jt`Log in with ${<Code key="email">{creatorEmail}</Code>} and the password from ${<Code key="pwd">{PASSWORD_ENV_VAR}</Code>}.`}
        </Text>
      )}
      <Text>
        {t`Edit the files locally and commit your changes — then pull them into the developer instance from the remote sync settings page.`}
      </Text>
    </Stack>
  );
}
