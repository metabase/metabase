import { jt, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Anchor, Button, Code, Divider, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";

export function SetupSection() {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <TitleSection
      label={t`Set up a development instance`}
      description={t`Run a local instance backed by this workspace's data, so you can iterate on changes safely.`}
    >
      {isRemoteSyncEnabled ? (
        <DevInstanceInstructions />
      ) : (
        <RemoteSyncMissing isAdmin={isAdmin} />
      )}
    </TitleSection>
  );
}

type RemoteSyncMissingProps = {
  isAdmin: boolean;
};

function RemoteSyncMissing({ isAdmin }: RemoteSyncMissingProps) {
  return (
    <Stack p="md" gap="sm" align="flex-start">
      <Text>{t`Set up remote sync to be able to pull instance data as files.`}</Text>
      {isAdmin ? (
        <Button variant="filled" component={Link} to={Urls.dataStudioGitSync()}>
          {t`Set up remote sync`}
        </Button>
      ) : (
        <Text c="text-secondary">{t`Ask your admin to set it up first.`}</Text>
      )}
    </Stack>
  );
}

const LOCAL_INSTANCE_URL = "http://localhost:3000";

function DevInstanceInstructions() {
  const siteUrl = useSetting("site-url") ?? "<site-url>";
  const remoteSyncUrl = useSetting("remote-sync-url") ?? "<remote-sync-url>";

  return (
    <>
      <Stack p="md" gap="sm">
        <Text>{t`Pull the latest content from this instance's git repository:`}</Text>
        <Code block>{getGitPullCommand(remoteSyncUrl)}</Code>
      </Stack>
      <Divider />
      <Stack p="md" gap="sm">
        <Text>{t`Export these environment variables:`}</Text>
        <Code block>{getEnvFileContents()}</Code>
      </Stack>
      <Divider />
      <Stack p="md" gap="sm">
        <Text>{t`Download the workspace's config file:`}</Text>
        <Code block>{getCurlCommand(siteUrl)}</Code>
      </Stack>
      <Divider />
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
        <Code block>{getDockerCommand()}</Code>
      </Stack>
      <Divider />
      <Stack p="md" gap="sm">
        <Text>
          {t`Edit the files locally and commit your changes — then pull them into the developer instance from Admin → Settings → Remote sync.`}
        </Text>
      </Stack>
    </>
  );
}

function getGitPullCommand(remoteSyncUrl: string) {
  return `git pull ${remoteSyncUrl}`;
}

function getEnvFileContents() {
  return [
    "MB_PREMIUM_EMBEDDING_TOKEN=",
    "MB_WORKSPACE_ACCESS_KEY=",
    "MB_WORKSPACE_USER_PASSWORD=",
  ].join("\n");
}

function getCurlCommand(siteUrl: string) {
  return `curl "${siteUrl}/api/ee/workspace-sharing/$MB_WORKSPACE_ACCESS_KEY/config/yaml" -o config.yml`;
}

function getDockerCommand() {
  return [
    "docker run -d -p 3000:3000 \\",
    "  -v $(pwd)/config.yml:/config.yml \\",
    "  -v $(pwd)/.git:/workspace/.git \\",
    "  -e MB_CONFIG_FILE_PATH=/config.yml \\",
    "  -e MB_REMOTE_SYNC_URL=file:///workspace/.git \\",
    "  -e MB_PREMIUM_EMBEDDING_TOKEN \\",
    "  -e MB_WORKSPACE_USER_PASSWORD \\",
    "  metabase/metabase-enterprise:latest",
  ].join("\n");
}
