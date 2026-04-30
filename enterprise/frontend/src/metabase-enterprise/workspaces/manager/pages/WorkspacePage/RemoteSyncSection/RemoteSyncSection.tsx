import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Group, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";

export function RemoteSyncSection() {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <TitleSection
      label={t`Remote sync`}
      description={t`Set up remote sync to be able to pull instance data as files.`}
    >
      {isRemoteSyncEnabled ? (
        <EnabledSection />
      ) : isAdmin ? (
        <AdminSetupSection />
      ) : (
        <NonAdminSetupSection />
      )}
    </TitleSection>
  );
}

function EnabledSection() {
  return (
    <Group p="md" gap="sm" wrap="nowrap" align="center">
      <Icon name="check_filled" c="success" size={20} />
      <Text>{t`Remote sync is set up.`}</Text>
    </Group>
  );
}

function AdminSetupSection() {
  return (
    <Stack p="md" gap="sm" align="flex-start">
      <Text>{t`Set up remote sync to start iterating on this workspace's entities as files in your Git repository.`}</Text>
      <Button variant="filled" component={Link} to={Urls.dataStudioGitSync()}>
        {t`Set up remote sync`}
      </Button>
    </Stack>
  );
}

function NonAdminSetupSection() {
  return (
    <Stack p="md" gap="sm">
      <Text>{t`Remote sync isn't set up yet. Ask your admin to configure it so this workspace's entities can be edited as files in your Git repository.`}</Text>
    </Stack>
  );
}
