import { useState } from "react";
import { IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Box, Flex, Text, Title } from "metabase/ui";

import { MetabotAISetup } from "./MetabotAISetup";
import { MetabotAnalyticsPage } from "./MetabotAnalyticsPage";
import { MetabotSettingsPage } from "./MetabotSettingsPage";

export type MetabotTab = "analytics" | "settings" | "permissions";

export function getAdminRoutes() {
  return [
    <IndexRoute key="index" component={MetabotAdminPage} />,
    <Redirect key="redirect" from="*" to="/admin/metabot" />,
  ];
}

function MetabotAdminPage() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState<MetabotTab>("settings");

  if (!isConfigured) {
    return (
      <AdminSettingsLayout>
        <ErrorBoundary>
          <MetabotAISetup onComplete={() => setIsConfigured(true)} />
        </ErrorBoundary>
      </AdminSettingsLayout>
    );
  }

  const useFullWidth = activeTab === "analytics";

  return (
    <AdminSettingsLayout
      sidebar={
        <MetabotNavPane activeTab={activeTab} onTabChange={setActiveTab} />
      }
      fullWidth={useFullWidth}
    >
      <ErrorBoundary>
        <MetabotTabContent tab={activeTab} />
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

function MetabotNavPane({
  activeTab,
  onTabChange,
}: {
  activeTab: MetabotTab;
  onTabChange: (tab: MetabotTab) => void;
}) {
  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          icon="insight"
          label={t`AI analytics`}
          active={activeTab === "analytics"}
          onClick={() => onTabChange("analytics")}
        />
        <AdminNavItem
          icon="gear"
          label={t`Settings`}
          active={activeTab === "settings"}
          onClick={() => onTabChange("settings")}
        />
        <AdminNavItem
          icon="lock"
          label={t`Permissions`}
          active={activeTab === "permissions"}
          onClick={() => onTabChange("permissions")}
        />
      </AdminNavWrapper>
    </Flex>
  );
}

function MetabotTabContent({ tab }: { tab: MetabotTab }) {
  switch (tab) {
    case "analytics":
      return <MetabotAnalyticsPage />;
    case "settings":
      return <MetabotSettingsPage />;
    case "permissions":
      return <MetabotPermissionsPlaceholder />;
  }
}

function MetabotPermissionsPlaceholder() {
  return (
    <Box p="2rem">
      <Title order={2}>{t`Permissions`}</Title>
      <Text c="text-secondary" mt="sm">
        {t`Per-user and per-group controls, limits, and overrides will appear here.`}
      </Text>
    </Box>
  );
}
