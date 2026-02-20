import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { PLUGIN_METABOT } from "metabase/plugins";
import { IndexRoute, Redirect } from "metabase/routing/compat/react-router-v3";
import { Flex } from "metabase/ui";

import { MetabotSQLGenerationSettingsSection } from "./MetabotSQLGenerationSettingsSection";

export function getAdminRoutes() {
  return (
    PLUGIN_METABOT.getAdminRoutes?.() ?? [
      <IndexRoute key="index" component={MetabotAdminPage} />,
      <Redirect key="redirect" from="*" to="/admin/metabot" />,
    ]
  );
}

export function MetabotAdminPage() {
  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <MetabotSQLGenerationSettingsSection />
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

function MetabotNavPane() {
  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          key="sql"
          icon="sql"
          label={t`SQL Generation`}
          path="/admin/metabot"
        />
      </AdminNavWrapper>
    </Flex>
  );
}
