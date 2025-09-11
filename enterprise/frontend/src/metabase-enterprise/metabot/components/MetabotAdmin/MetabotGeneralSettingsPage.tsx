import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Flex, Switch, Text } from "metabase/ui";

import { MetabotNavPane } from "./MetabotNavPane";

export function MetabotGeneralSettingsPage() {
  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <SettingsSection title={t`Metabot`}>
          <MetabotEnabledPane />
        </SettingsSection>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

function MetabotEnabledPane() {
  const {
    value: isEnabled,
    updateSetting,
    isLoading,
    error,
  } = useAdminSetting("metabot-feature-enabled");

  const handleToggle = async (checked: boolean) => {
    await updateSetting({
      key: "metabot-feature-enabled",
      value: checked,
    });
  };

  if (isLoading || error) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error loading Metabot settings` : null}
      />
    );
  }

  return (
    <Box>
      <SettingHeader
        id="enable-metabot"
        title={t`Enable Metabot`}
        description={t`Metabot is Metabase's AI assistant. When enabled, Metabot will be available to help users create queries, analyze data, and answer questions about your data.`} // eslint-disable-line no-literal-metabase-strings -- admin UI context
      />
      <Flex align="center" gap="md" mt="md">
        <Switch
          checked={Boolean(isEnabled)}
          onChange={(event) => handleToggle(event.currentTarget.checked)}
          size="sm"
        />
        <Text c={isEnabled ? "text-dark" : "text-medium"} fw="500">
          {isEnabled ? t`Metabot is enabled` : t`Metabot is disabled`}
        </Text>
      </Flex>
    </Box>
  );
}
