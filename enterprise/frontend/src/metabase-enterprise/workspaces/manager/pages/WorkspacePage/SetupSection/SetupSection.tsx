import { Link } from "react-router";
import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Anchor, Code, Divider, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace } from "metabase-types/api";

const LOCAL_INSTANCE_URL = "http://localhost:3000";

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
      <RunDockerSection />
      <Divider />
      <CommitChangesSection />
    </TitleSection>
  );
}

function RemoteSyncSection() {
  const isRemoteSyncEnabled = !!useSetting("remote-sync-enabled");
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncUrl = useSetting("remote-sync-url");
  const command = `git pull ${remoteSyncUrl}`;

  if (!isRemoteSyncEnabled) {
    const setupLink = isAdmin ? (
      <Anchor key="setup" component={Link} to={Urls.adminRemoteSync()}>
        {t`Set up remote sync`}
      </Anchor>
    ) : (
      t`Set up remote sync`
    );
    return (
      <Stack p="md" gap="sm">
        <Text>{jt`${setupLink} to be able to pull instance data as files.`}</Text>
      </Stack>
    );
  }

  return (
    <Stack p="md" gap="sm">
      <Text>{t`Pull the latest content from this instance's git repository:`}</Text>
      <Code block>{command}</Code>
    </Stack>
  );
}

type DownloadConfigSectionProps = {
  workspace: Workspace;
};

function DownloadConfigSection({ workspace }: DownloadConfigSectionProps) {
  const siteUrl = useSetting("site-url") ?? "";
  const sharingKey = workspace.sharing_key;
  const downloadUrl = `/api/ee/workspace-manager/${workspace.id}/config/yaml`;
  const downloadLink = (
    <Anchor key="dl" href={downloadUrl} download="config.yml">
      {t`Download the workspace's config file`}
    </Anchor>
  );
  const curlCommand = `curl "${siteUrl}/api/ee/workspace-sharing/${sharingKey}/config/yaml" -o config.yml`;

  return (
    <Stack p="md" gap="sm">
      {sharingKey != null ? (
        <>
          <Text>
            {jt`${downloadLink} or do an API call with the access key:`}
          </Text>
          <Code block>{curlCommand}</Code>
        </>
      ) : (
        <Text>
          {jt`${downloadLink}. Create an access key to be able to download it with an API call.`}
        </Text>
      )}
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

function RunDockerSection() {
  const dockerCommand = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -v $(pwd)/.git:/workspace/.git \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_REMOTE_SYNC_URL=file:///workspace/.git \\
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

function CommitChangesSection() {
  const settingsLink = (
    <Anchor
      key="settings"
      href={`${LOCAL_INSTANCE_URL}${Urls.adminRemoteSync()}`}
      target="_blank"
      rel="noreferrer"
    >
      {t`remote sync settings page`}
    </Anchor>
  );
  return (
    <Stack p="md" gap="sm">
      <Text>
        {jt`Edit the files locally and commit your changes — then pull them into the developer instance from the ${settingsLink}.`}
      </Text>
    </Stack>
  );
}
