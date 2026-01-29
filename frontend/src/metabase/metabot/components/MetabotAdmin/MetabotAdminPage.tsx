import { IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Flex } from "metabase/ui";

import { MetabotSQLGenerationSettingsSection } from "./MetabotSQLGenerationSettingsSection";

export function getAdminRoutes() {
  return [
    <IndexRoute key="index" component={MetabotAdminPage} />,
    <Redirect key="redirect" from="*" to="/admin/metabot" />,
  ];
}

function MetabotAdminPage() {
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
