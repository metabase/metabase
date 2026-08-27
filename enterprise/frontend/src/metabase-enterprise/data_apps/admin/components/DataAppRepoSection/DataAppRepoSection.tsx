import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

const REMOTE_SYNC_SETTINGS_PATH = "/admin/settings/remote-sync";

type Props = {
  /** Whether a repository is connected via remote-sync. */
  isConfigured: boolean;
  /** The connected repository URL (shown when configured). */
  url?: string | null;
};

export const DataAppRepoSection = ({ isConfigured, url }: Props) => (
  <Stack gap="sm">
    <Title order={3}>{t`Remote sync repo`}</Title>

    <Text>
      {t`Data apps live in the repository connected via Git sync. Each app's built bundle is served at /apps/:name.`}
    </Text>

    <Group gap="md" wrap="nowrap" align="center">
      <Group
        gap="sm"
        wrap="nowrap"
        flex={1}
        miw={0}
        px="md"
        py="sm"
        bg="background-secondary"
        bd="1px solid var(--mb-color-border)"
        bdrs="md"
        visibleFrom="sm"
      >
        <Icon name="git_branch" c="text-secondary" size={16} flex="0 0 auto" />
        <Text
          ff="monospace"
          c={isConfigured ? "text-primary" : "text-secondary"}
          truncate
        >
          {isConfigured ? url : t`No repository connected`}
        </Text>
      </Group>

      <Button component={Link} to={REMOTE_SYNC_SETTINGS_PATH} variant="default">
        {t`Go to Git sync settings`}
      </Button>
    </Group>
  </Stack>
);
