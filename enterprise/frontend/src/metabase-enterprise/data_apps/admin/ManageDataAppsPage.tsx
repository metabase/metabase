import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { Badge, Box, Flex, Group, Loader, Stack, Title } from "metabase/ui";
import {
  useGetDataAppRepoStatusQuery,
  useListDataAppsQuery,
} from "metabase-enterprise/api";

import S from "./ManageDataAppsPage.module.css";
import { DataAppListItem } from "./components/DataAppListItem/DataAppListItem";
import { DataAppRepoSection } from "./components/DataAppRepoSection/DataAppRepoSection";
import { DataAppSkillsSection } from "./components/DataAppSkillsSection/DataAppSkillsSection";
import { DataAppsEmptyState } from "./components/DataAppsEmptyState/DataAppsEmptyState";
import { DataAppsBanner } from "./components/DataAppsPromoBanner/DataAppsBanner";

const DATA_APP_REPO_QUERY_OPTS = {
  // Keep the sync status fresh while the page is open: the backend polls the repo
  // on its own schedule, so re-fetch the list periodically to reflect those syncs.
  // Skipped automatically when the tab is unfocused.
  pollingInterval: 10_000,
  skipPollingIfUnfocused: true,
  // Repo connection is managed on a different tab (Remote Sync) through another
  // API slice, so it can't invalidate this cache. Refetch on mount so navigating
  // (back) to the Data apps tab always reflects the current connection instead
  // of a stale cached value.
  refetchOnMountOrArgChange: true,
} as const;

export const ManageDataAppsPage = () => {
  const { data: status, isLoading: isStatusLoading } =
    useGetDataAppRepoStatusQuery(undefined, DATA_APP_REPO_QUERY_OPTS);
  const { data: apps, isLoading: isAppsLoading } = useListDataAppsQuery(
    undefined,
    DATA_APP_REPO_QUERY_OPTS,
  );

  const isConfigured = status?.configured ?? false;

  return (
    <SettingsPageWrapper>
      <Group gap="sm" align="center">
        <Title order={1}>{t`Data apps`}</Title>

        <Badge>{t`Beta`}</Badge>
      </Group>

      <DataAppsBanner />

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
          <Title order={2}>{t`Apps`}</Title>

          {isAppsLoading && (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          )}

          {apps?.length === 0 && !isAppsLoading && <DataAppsEmptyState />}

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
