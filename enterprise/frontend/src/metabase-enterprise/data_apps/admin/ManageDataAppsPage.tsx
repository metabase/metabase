import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
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
  useGetDataAppRepoStatusQuery,
  useListDataAppsQuery,
} from "metabase-enterprise/api";

import S from "./ManageDataAppsPage.module.css";
import { DataAppListItem } from "./components/DataAppListItem/DataAppListItem";
import { DataAppRepoSection } from "./components/DataAppRepoSection/DataAppRepoSection";
import { DataAppSkillsSection } from "./components/DataAppSkillsSection/DataAppSkillsSection";

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

export const ManageDataAppsPage = () => {
  const { data: status, isLoading: isStatusLoading } =
    useGetDataAppRepoStatusQuery(undefined, POLL_OPTS);
  const { data: apps, isLoading: isAppsLoading } = useListDataAppsQuery(
    undefined,
    POLL_OPTS,
  );

  const isConfigured = status?.configured ?? false;

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
          <DataAppRepoSection isConfigured={isConfigured} url={status?.url} />

          <DataAppSkillsSection />
        </SettingsSection>
      </Stack>

      {isStatusLoading ? (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      ) : (
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>{t`Apps`}</Title>
            {apps && apps.length > 0 && (
              <Text c="text-secondary" pr="md">
                {t`Enabled`}
              </Text>
            )}
          </Group>

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
};
