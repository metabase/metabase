import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Stack } from "metabase/ui";

import { canAccessDataStudioSettings } from "../../../selectors";

export function SettingsPage() {
  usePageTitle(t`Settings`);
  const canAccessSettings = useSelector(canAccessDataStudioSettings);
  const canAccessDevelopmentInstanceSettings = useSelector(
    PLUGIN_WORKSPACES.canAccessDevelopmentInstanceSettings,
  );

  if (!canAccessSettings) {
    return null;
  }

  return (
    <PageContainer data-testid="data-studio-settings-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs role="heading">{t`Settings`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <Stack maw="40rem" mx="auto" w="100%" gap="lg">
        {canAccessDevelopmentInstanceSettings && (
          <PLUGIN_WORKSPACES.DevelopmentInstanceSection />
        )}
      </Stack>
    </PageContainer>
  );
}
