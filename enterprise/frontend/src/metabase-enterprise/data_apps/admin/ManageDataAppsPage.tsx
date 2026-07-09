import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { Link } from "metabase/common/components/Link";
import { useSetting } from "metabase/common/hooks";
import {
  Box,
  Flex,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import {
  isLocalOrSnapshotVersion,
  versionToNumericComponents,
} from "metabase/utils/version";
import {
  useGetDataAppRepoStatusQuery,
  useListDataAppsQuery,
} from "metabase-enterprise/api";

import { DataAppListItem } from "./DataAppListItem";
import S from "./ManageDataAppsPage.module.css";

const REMOTE_SYNC_SETTINGS_PATH = "/admin/settings/remote-sync";

const REPOSITORY_NAME = "metabase/metabase";
const MAIN_BRANCH_NAME = "master";
const RELEASE_BRANCH_PREFIX = "release";
const PUBLIC_SKILLS_PATH = "/skills";

// The data-app skills to install. `skills add metabase/metabase` alone would
// discover *every* skill in the repo, so each is selected explicitly.
const DATA_APP_SKILLS = [
  "metabase-data-app-setup",
  "metabase-data-app-routing",
  "metabase-data-app-actions",
  "metabase-data-app-semantic-layer",
];

// Keep the sync status fresh while the page is open: the backend polls the repo
// on its own schedule, so re-fetch the list periodically to reflect those syncs.
// Skipped automatically when the tab is unfocused.
const STATUS_POLL_INTERVAL_MS = 10_000;

const POLL_OPTS = {
  pollingInterval: STATUS_POLL_INTERVAL_MS,
  skipPollingIfUnfocused: true,
} as const;

export function ManageDataAppsPage() {
  const { data: status, isLoading: isStatusLoading } =
    useGetDataAppRepoStatusQuery(undefined, POLL_OPTS);
  const { data: apps, isLoading: isAppsLoading } = useListDataAppsQuery(
    undefined,
    POLL_OPTS,
  );

  const isConfigured = status?.configured ?? false;

  // Pin the data-app skills (and the template bundled inside `metabase-data-app-setup`)
  // to the branch matching this instance: `release-x.<major>.x`, or `master` for
  // local/dev builds that have no release branch.
  const { tag } = useSetting("version");
  const majorVersion = tag ? versionToNumericComponents(tag)?.[1] : undefined;
  const skillBranch =
    tag && !isLocalOrSnapshotVersion(tag) && majorVersion != null
      ? `${RELEASE_BRANCH_PREFIX}-x.${majorVersion}.x`
      : MAIN_BRANCH_NAME;
  const skillSelectors = DATA_APP_SKILLS.map(
    (skill) => `--skill ${skill}`,
  ).join(" ");
  const installSkillCommand = `npx skills add ${REPOSITORY_NAME}${PUBLIC_SKILLS_PATH}#${skillBranch} ${skillSelectors}`;

  return (
    <SettingsPageWrapper>
      <Title order={1} style={{ height: "2.5rem" }}>
        {t`Data apps`}
      </Title>

      <Stack gap="md">
        <Title order={2}>{t`Setup`}</Title>

        <SettingsSection
          stackProps={{
            gap: "lg",
          }}
        >
          <Stack gap="sm">
            <SettingHeader title={t`Remote Sync`} />

            <Text c="text-secondary" maw="40rem">
              {t`Data apps live in the repository connected via Git sync. Each app's built bundle is served at /apps/:name.`}
            </Text>

            <Group gap="xs">
              <Icon name="git_branch" c="text-secondary" size={14} />
              <Text
                component={Link}
                c="brand"
                fw={700}
                to={REMOTE_SYNC_SETTINGS_PATH}
              >
                {t`Configure the connected repository in Git sync settings`}
              </Text>
            </Group>
          </Stack>

          <Stack gap="sm">
            <SettingHeader title={t`Skills`} />

            <Text c="text-secondary">{t`Install data app skills into your project, then ask your AI agent to create a data app.`}</Text>

            <CopyTextInput
              value={installSkillCommand}
              w="100%"
              classNames={{ input: S.command }}
            />
          </Stack>
        </SettingsSection>
      </Stack>

      {isStatusLoading ? (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      ) : !isConfigured ? (
        <Group
          align="center"
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          bg="background-primary"
          justify="center"
          mih="10rem"
          p="xl"
        >
          <Text c="text-tertiary">
            {t`No repository is connected yet. Connect one in Git sync settings to add data apps.`}
          </Text>
        </Group>
      ) : (
        <Stack gap="md">
          <Title order={2}>{t`Apps`}</Title>

          {isAppsLoading && (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          )}

          {apps && apps.length === 0 && !isAppsLoading && (
            <Group
              align="center"
              bd="1px solid var(--mb-color-border)"
              bdrs="md"
              bg="background-primary"
              justify="center"
              mih="10rem"
              p="xl"
            >
              <Text c="text-tertiary">{t`The connected repository has no data apps yet.`}</Text>
            </Group>
          )}

          {apps && apps.length > 0 && (
            <Box
              bd="1px solid var(--mb-color-border)"
              bdrs="md"
              bg="background-primary"
              className={S.appList}
              style={{ overflow: "hidden" }}
            >
              {apps.map((app) => (
                <DataAppListItem key={app.id} app={app} />
              ))}
            </Box>
          )}
        </Stack>
      )}
    </SettingsPageWrapper>
  );
}
