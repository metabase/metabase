import { useState } from "react";
import { IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Flex, Text } from "metabase/ui";

import { MetabotAISetup } from "./MetabotAISetup";
import { MetabotAnalyticsPage } from "./MetabotAnalyticsPage";
import { MetabotCustomizePage } from "./MetabotCustomizePage";
import { MetabotGuidesPage } from "./MetabotGuidesPage";
import { MetabotPermissionsPage } from "./MetabotPermissionsPage";
import { MetabotSettingsPage } from "./MetabotSettingsPage";

export type MetabotTab = "analytics" | "settings" | "permissions" | "customize" | "guides";

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

  const useFullWidth =
    activeTab === "analytics" || activeTab === "permissions";

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
          label={t`Usage controls`}
          active={activeTab === "permissions"}
          onClick={() => onTabChange("permissions")}
        />
        <AdminNavItem
          icon="palette"
          label={t`Customize`}
          active={activeTab === "customize"}
          onClick={() => onTabChange("customize")}
        />
        <AdminNavItem
          icon="document"
          label={t`Guides`}
          active={activeTab === "guides"}
          onClick={() => onTabChange("guides")}
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
      return <MetabotPermissionsPage />;
    case "customize":
      return <MetabotCustomizePage />;
    case "guides":
      return <MetabotGuidesPage />;
  }
}
