import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Stack, Tabs, Text } from "metabase/ui";

import { MetabotNavPane } from "../MetabotNavPane";

import { AiAccessControlsTable } from "./AiAccessControlsTable";

export function MetabotUsageControlsPage() {
  const {
    data: groups,
    isLoading,
    error,
  } = useListPermissionsGroupsQuery(undefined);

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />} fullWidth>
      <Box p="xl">
        <Tabs defaultValue="permissions">
          <Tabs.List>
            <Tabs.Tab value="permissions">{t`Permissions`}</Tabs.Tab>
            <Tabs.Tab value="usage-limits">{t`Usage limits`}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="permissions">
            <SettingsSection
              description={t`Control which groups can use Metabot and which capabilities are available to them.`}
              mt="xl"
              title={t`AI access controls`}
              titleProps={{ mb: "sm" }}
            >
              <LoadingAndErrorWrapper
                loading={isLoading}
                error={error ? t`Error loading groups` : null}
              >
                {groups && <AiAccessControlsTable groups={groups} />}
              </LoadingAndErrorWrapper>
            </SettingsSection>
          </Tabs.Panel>

          <Tabs.Panel value="usage-limits">
            <Stack gap="md" mt="xl">
              <Text c="text-secondary" size="sm">
                {t`Yet to be implemented.`}
              </Text>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Box>
    </AdminSettingsLayout>
  );
}
