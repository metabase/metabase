import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Stack } from "metabase/ui";

export function SettingsPage() {
  usePageTitle(t`Settings`);
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin) {
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
        <PLUGIN_WORKSPACES.DevelopmentInstanceSection />
      </Stack>
    </PageContainer>
  );
}
