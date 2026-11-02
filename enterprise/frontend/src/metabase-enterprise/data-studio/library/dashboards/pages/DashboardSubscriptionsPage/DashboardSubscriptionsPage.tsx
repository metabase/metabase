import { useMemo, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { getUserIsAdmin } from "metabase/current-user";
import { useCanManageDashboardSubscriptions } from "metabase/dashboard/hooks";
import { useSelector } from "metabase/redux";
import {
  Button,
  Card,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Dashboard, DashboardSubscription } from "metabase-types/api";

import { DashboardPageShell } from "../../components/DashboardPageShell";

import { SubscriptionSidebar } from "./SubscriptionSidebar";
import { useDashboardSubscriptions } from "./use-dashboard-subscriptions";
import { useSubscriptionColumns } from "./use-subscription-columns";
import { filterSubscriptionRows, getSubscriptionRows } from "./utils";

export function DashboardSubscriptionsPage() {
  return (
    <DashboardPageShell
      data-testid="dashboard-subscriptions-page"
      aside={(dashboard, containerWidth) => (
        <SelectedSubscriptionSidebar
          dashboard={dashboard}
          containerWidth={containerWidth}
        />
      )}
    >
      {(dashboard) => <DashboardSubscriptions dashboard={dashboard} />}
    </DashboardPageShell>
  );
}

type DashboardSubscriptionsProps = {
  dashboard: Dashboard;
};

function DashboardSubscriptions({ dashboard }: DashboardSubscriptionsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const isAdmin = useSelector(getUserIsAdmin);
  const canManageSubscriptions = useCanManageDashboardSubscriptions(dashboard);
  const { subscriptions, isLoading, error, selection } =
    useDashboardSubscriptions(dashboard);
  const rows = useMemo(
    () => getSubscriptionRows(subscriptions ?? [], dashboard.parameters ?? []),
    [subscriptions, dashboard.parameters],
  );
  const filteredRows = useMemo(
    () => filterSubscriptionRows(rows, searchQuery),
    [rows, searchQuery],
  );
  const selectedSubscriptionId =
    selection.type === "found" ? selection.subscription.id : undefined;
  const columns = useSubscriptionColumns({
    isSidebarOpen: selection.type !== "none",
  });
  const treeTableInstance = useTreeTableInstance({
    data: filteredRows,
    columns,
    getNodeId: (row) => String(row.id),
    selectedRowId:
      selectedSubscriptionId != null ? String(selectedSubscriptionId) : null,
  });
  const manageUrl = Urls.dashboard(dashboard, { openSubscriptions: true });
  const listUrl = Urls.dataStudioDashboardSubscriptions(dashboard.id);
  const getRowUrl = (subscriptionId: DashboardSubscription["id"]) =>
    subscriptionId === selectedSubscriptionId
      ? listUrl
      : Urls.dataStudioDashboardSubscriptions(dashboard.id, subscriptionId);

  if (isLoading || error != null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Stack gap="lg">
      <Group gap="md" wrap="nowrap">
        <TextInput
          flex={1}
          placeholder={t`Search...`}
          leftSection={<Icon name="search" />}
          bdrs="sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {canManageSubscriptions && rows.length > 0 && (
          <Button component={ForwardRefLink} to={manageUrl}>
            {t`Manage subscriptions`}
          </Button>
        )}
      </Group>
      {!isAdmin && rows.length > 0 && (
        <Text c="text-secondary">
          {t`Only the subscriptions you created are listed.`}
        </Text>
      )}
      <Card withBorder p={0}>
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          emptyState={
            <SubscriptionsEmptyState
              searchQuery={searchQuery}
              manageUrl={canManageSubscriptions ? manageUrl : null}
              isAdmin={isAdmin}
            />
          }
          renderRowLink={(row, props) => (
            <Link to={getRowUrl(row.original.id)} {...props} />
          )}
        />
      </Card>
    </Stack>
  );
}

type SelectedSubscriptionSidebarProps = {
  dashboard: Dashboard;
  containerWidth: number;
};

function SelectedSubscriptionSidebar({
  dashboard,
  containerWidth,
}: SelectedSubscriptionSidebarProps) {
  const { isLoading, error, selection } = useDashboardSubscriptions(dashboard);

  if (isLoading || error != null || selection.type === "none") {
    return null;
  }

  return (
    <SubscriptionSidebar
      dashboard={dashboard}
      selection={selection}
      closeUrl={Urls.dataStudioDashboardSubscriptions(dashboard.id)}
      containerWidth={containerWidth}
    />
  );
}

type SubscriptionsEmptyStateProps = {
  searchQuery: string;
  /** Where to set up a subscription, or `null` when the user can't. */
  manageUrl: string | null;
  isAdmin: boolean;
};

function SubscriptionsEmptyState({
  searchQuery,
  manageUrl,
  isAdmin,
}: SubscriptionsEmptyStateProps) {
  if (searchQuery) {
    return <ListEmptyState label={t`No results for "${searchQuery}"`} />;
  }

  const label = isAdmin
    ? t`No subscriptions yet`
    : t`You haven't created any subscriptions yet`;

  if (manageUrl == null) {
    return <ListEmptyState label={label} />;
  }

  return (
    <ListEmptyState
      label={label}
      description={t`Subscriptions are set up from the dashboard.`}
      action={
        <Button component={ForwardRefLink} to={manageUrl} variant="filled">
          {t`Set up a subscription`}
        </Button>
      }
    />
  );
}
