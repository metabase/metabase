import { Link } from "react-router";
import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Anchor, Button, Code, Divider, Group, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
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
      <RemoteSyncSection />
      <Divider />
      <DownloadConfigSection workspace={workspace} />
      <Divider />
      <ExportLicenseSection />
      <Divider />
      <RunInstanceSection />
      <Divider />
      <CommitChangesSection />
    </TitleSection>
  );
}

function RemoteSyncSection() {
  const isRemoteSyncEnabled = !!useSetting("remote-sync-enabled");
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncUrl = useSetting("remote-sync-url") ?? "";

  if (!isRemoteSyncEnabled) {
    return (
      <Stack p="md" gap="sm">
        <Text>{t`Set up remote sync to be able to pull instance data as files:`}</Text>
        {isAdmin && (
          <Group>
            <Button
              component={Link}
              to={Urls.adminRemoteSync()}
              variant="filled"
            >
              {t`Set up remote sync`}
            </Button>
          </Group>
        )}
      </Stack>
    );
  }

  return (
    <Stack p="md" gap="sm">
      <Text>{t`Clone the workspace repository:`}</Text>
      <Code block>{remoteSyncUrl}</Code>
    </Stack>
  );
}

type DownloadConfigSectionProps = {
  workspace: Workspace;
};

function DownloadConfigSection({ workspace }: DownloadConfigSectionProps) {
  const configUrl = `/api/ee/workspace-manager/${workspace.id}/config/yaml`;
  const metadataUrl = `/api/ee/workspace-manager/${workspace.id}/table-metadata/json`;

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
        <Text>{t`Optionally, download table metadata from this instance to skip syncing the database in the development instance:`}</Text>
        <Button component="a" href={metadataUrl} download="table_metadata.json">
          {t`Download table_metadata.json`}
        </Button>
      </Stack>
    </Stack>
  );
}

function ExportLicenseSection() {
  const envFileContents = "MB_PREMIUM_EMBEDDING_TOKEN=";

  return (
    <Stack p="md" gap="sm">
      <Text>{t`Export your license token as an environment variable:`}</Text>
      <Code block>{envFileContents}</Code>
    </Stack>
  );
}

function RunInstanceSection() {
  const jarCommand = `MB_CONFIG_FILE_PATH=./config.yml \\
MB_REMOTE_SYNC_URL=file://$(pwd)/.git \\
MB_TABLE_METADATA_PATH=./table_metadata.json \\
java -jar metabase.jar`;

  const dockerCommand = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -v $(pwd)/table_metadata.json:/table_metadata.json \\
  -v $(pwd)/.git:/workspace/.git \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_REMOTE_SYNC_URL=file:///workspace/.git \\
  -e MB_TABLE_METADATA_PATH=/table_metadata.json \\
  -e MB_PREMIUM_EMBEDDING_TOKEN \\
  metabase/metabase-enterprise:latest`;

  return (
    <Stack p="md" gap="sm">
      <Text>
        {jt`In the repository root, start the developer instance at ${(
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
      <Text>{t`With a jar:`}</Text>
      <Code block>{jarCommand}</Code>
      <Text>{t`With a Docker image:`}</Text>
      <Code block>{dockerCommand}</Code>
    </Stack>
  );
}

function CommitChangesSection() {
  return (
    <Stack p="md" gap="sm">
      <Text>
        {t`Edit the files locally and commit your changes — then pull them into the developer instance from the remote sync settings page.`}
      </Text>
    </Stack>
  );
}
