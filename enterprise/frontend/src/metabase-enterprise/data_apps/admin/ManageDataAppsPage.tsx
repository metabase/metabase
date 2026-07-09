import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { Link } from "metabase/common/components/Link";
import { useSetting } from "metabase/common/hooks";
import {
  ActionIcon,
  Box,
  Button,
  CopyButton,
  Flex,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
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
  // Repo connection is managed on a different tab (Remote Sync) through another
  // API slice, so it can't invalidate this cache. Refetch on mount so navigating
  // (back) to the Data apps tab always reflects the current connection instead
  // of a stale cached value.
  refetchOnMountOrArgChange: true,
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

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin UI string
  const skillsMainText = t`Install Metabase Data App skills in your project, then ask your AI agent to create a data app.`;
  const skillBranch =
    tag && !isLocalOrSnapshotVersion(tag) && majorVersion != null
      ? `${RELEASE_BRANCH_PREFIX}-x.${majorVersion}.x`
      : MAIN_BRANCH_NAME;
  const skillCommandBase = `npx skills add ${REPOSITORY_NAME}${PUBLIC_SKILLS_PATH}#${skillBranch}`;
  const skillSelectors = DATA_APP_SKILLS.map((skill) => `--skill ${skill}`);
  // One line to copy (a runnable command); shown wrapped across lines for
  // readability.
  const installSkillCommand = [skillCommandBase, ...skillSelectors].join(" ");
  const installSkillCommandDisplay = [skillCommandBase, ...skillSelectors].join(
    "\n",
  );

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
              >
                <Icon
                  name="git_branch"
                  c="text-secondary"
                  size={16}
                  flex="0 0 auto"
                />
                <Text
                  ff="monospace"
                  c={isConfigured ? "text-primary" : "text-secondary"}
                  truncate
                >
                  {isConfigured ? status?.url : t`No repository connected`}
                </Text>
              </Group>
              <Button
                component={Link}
                to={REMOTE_SYNC_SETTINGS_PATH}
                variant="default"
              >
                {t`Go to Git sync settings`}
              </Button>
            </Group>
          </Stack>

          <Stack gap="sm">
            <Title order={3}>{t`AI skills`}</Title>

            <Text>{skillsMainText}</Text>

            <Box className={S.command} pos="relative">
              <CopyButton value={installSkillCommand} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t`Copied!` : t`Copy`}>
                    <ActionIcon
                      className={S.copyButton}
                      variant="subtle"
                      c="text-secondary"
                      aria-label={t`Copy`}
                      data-testid="copy-button"
                      onClick={copy}
                    >
                      <Icon name="copy" />
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
              <Text component="pre" className={S.commandText}>
                {installSkillCommandDisplay}
              </Text>
            </Box>
          </Stack>
        </SettingsSection>
      </Stack>

      {isStatusLoading ? (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      ) : (
        <Stack gap="md">
          <Title order={2}>{t`Apps`}</Title>

          {isAppsLoading && (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          )}

          {apps?.length === 0 && !isAppsLoading && (
            <Flex
              direction="column"
              align="center"
              justify="center"
              gap="md"
              bd="1px solid var(--mb-color-border)"
              bdrs="md"
              bg="background-primary"
              mih="16rem"
              p="xl"
            >
              <Flex
                align="center"
                justify="center"
                w="6rem"
                h="6rem"
                bg="background-secondary"
                style={{ borderRadius: "50%" }}
              >
                <Icon name="app" size={48} c="border" />
              </Flex>
              <Text c="text-disabled">{t`Your data apps will appear here`}</Text>
            </Flex>
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
                <DataAppListItem
                  key={app.id}
                  app={app}
                  canRemove={!isConfigured}
                />
              ))}
            </Box>
          )}
        </Stack>
      )}
    </SettingsPageWrapper>
  );
}
