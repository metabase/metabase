import { t } from "ttag";

import { useUpdateDashboardMutation } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Link } from "metabase/common/components/Link/Link";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { useMetadataToasts } from "metabase/common/hooks";
import { DASHBOARD_NAME_MAX_LENGTH } from "metabase/common/utils/dashboard";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useLocation, useNavigate } from "metabase/router";
import { Button, Group, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

type LibraryDashboardHeaderProps = {
  dashboard: Dashboard;
};

export function LibraryDashboardHeader({
  dashboard,
}: LibraryDashboardHeaderProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [updateDashboard] = useUpdateDashboardMutation();
  const { sendErrorToast } = useMetadataToasts();
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: dashboard.collection_id,
  });

  const handleNameChange = async (name: string) => {
    const { error } = await updateDashboard({ id: dashboard.id, name });
    if (error) {
      sendErrorToast(t`Failed to update dashboard name`);
    }
  };

  // Saving or canceling in the dashboard editor brings the user back here
  const handleEdit = () =>
    navigate(Urls.dashboard(dashboard, { editMode: true }), {
      state: { returnTo: pathname },
    });

  return (
    <PaneHeader
      data-testid="library-dashboard-header"
      icon="dashboard"
      title={
        <PaneHeaderInput
          initialValue={dashboard.name}
          maxLength={DASHBOARD_NAME_MAX_LENGTH}
          readOnly={!dashboard.can_write}
          onChange={handleNameChange}
        />
      }
      tabs={<PillTabNavigation tabs={getTabs(dashboard)} />}
      actions={
        // aligned to the bottom of the header, on the tabs' line
        <Group gap="sm" wrap="nowrap" style={{ alignSelf: "flex-end" }}>
          <Button
            component={ForwardRefLink}
            to={Urls.dashboard(dashboard)}
            rightSection={<Icon name="external" />}
          >
            {t`View`}
          </Button>
          {dashboard.can_write && (
            <Button leftSection={<Icon name="pencil" />} onClick={handleEdit}>
              {t`Edit`}
            </Button>
          )}
        </Group>
      }
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          {path?.map((collection) => (
            <Link key={collection.id} to={Urls.dataStudioLibraryDashboards()}>
              {collection.name}
            </Link>
          ))}
          <span>{dashboard.name}</span>
        </DataStudioBreadcrumbs>
      }
    />
  );
}

function getTabs(dashboard: Dashboard): PillTab[] {
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: Urls.dataStudioLibraryDashboard(dashboard.id),
    },
    {
      label: t`Contents`,
      to: Urls.dataStudioLibraryDashboardContents(dashboard.id),
    },
  ];

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    const dependenciesUrl = Urls.dataStudioLibraryDashboardDependencies(
      dashboard.id,
    );
    tabs.push({
      label: t`Dependencies`,
      to: dependenciesUrl,
      isSelected: (pathname) => pathname.startsWith(dependenciesUrl),
    });
  }

  tabs.push({
    label: t`Usage stats`,
    to: Urls.dataStudioLibraryDashboardUsageStats(dashboard.id),
  });

  return tabs;
}
