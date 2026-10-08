import { useMemo, useState } from "react";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { useListSubscriptionsQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import {
  buildRecipientText,
  friendlySchedule,
} from "metabase/dashboard/components/DashboardSubscriptionsSidebar/PulsesListSidebar";
import {
  Box,
  Card,
  EntityNameCell,
  Icon,
  Stack,
  Text,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  Dashboard,
  DashboardSubscription,
  IconName,
} from "metabase-types/api";

import { LibraryDashboardPage } from "../components/LibraryDashboardPage";

type SubscriptionRow = {
  id: string;
  delivery: string;
  icon: IconName;
  recipients: string;
  createdBy: string;
  createdAt: string;
};

const CHANNEL_ICONS: Record<string, IconName> = {
  email: "mail",
  slack: "slack",
};

const getNodeId = (row: SubscriptionRow) => row.id;
const globalFilterFn = (
  row: { original: SubscriptionRow },
  _columnId: string,
  filterValue: string,
) => {
  const query = filterValue.toLowerCase();
  return [
    row.original.delivery,
    row.original.recipients,
    row.original.createdBy,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

export function LibraryDashboardSubscriptionsPage() {
  return (
    <LibraryDashboardPage data-testid="library-dashboard-subscriptions-page">
      {(dashboard) => <LibraryDashboardSubscriptions dashboard={dashboard} />}
    </LibraryDashboardPage>
  );
}

function LibraryDashboardSubscriptions({
  dashboard,
}: {
  dashboard: Dashboard;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: subscriptions = [], isLoading } = useListSubscriptionsQuery({
    dashboard_id: dashboard.id,
  });
  const rows = useMemo(
    () => subscriptions.filter(hasChannel).map(getSubscriptionRow),
    [subscriptions],
  );

  const columns = useMemo<TreeTableColumnDef<SubscriptionRow>[]>(
    () => [
      {
        id: "delivery",
        header: t`Subscription`,
        accessorKey: "delivery",
        enableSorting: true,
        minWidth: 240,
        cell: ({ row }) => (
          <EntityNameCell
            icon={row.original.icon}
            name={row.original.delivery}
          />
        ),
      },
      {
        id: "recipients",
        header: t`Recipients`,
        accessorKey: "recipients",
        enableSorting: true,
        minWidth: 160,
        cell: ({ row }) => <Text truncate>{row.original.recipients}</Text>,
      },
      {
        id: "createdBy",
        header: t`Created by`,
        accessorKey: "createdBy",
        enableSorting: true,
        minWidth: 140,
        cell: ({ row }) => <Text truncate>{row.original.createdBy}</Text>,
      },
      {
        id: "createdAt",
        header: t`Created at`,
        accessorKey: "createdAt",
        enableSorting: true,
        sortingFn: "datetime",
        minWidth: 160,
        cell: ({ row }) => <DateTime value={row.original.createdAt} />,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: rows,
    columns,
    getNodeId,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
  });

  const emptyState =
    rows.length === 0 ? (
      <Box p="xxl">
        <EmptyState
          message={t`No subscriptions`}
          spacing="sm"
          illustrationElement={
            <img src={noResultsSource} alt="" width={120} height={120} />
          }
        />
      </Box>
    ) : searchQuery && treeTableInstance.rows.length === 0 ? (
      <ListEmptyState label={t`No results for "${searchQuery}"`} />
    ) : null;

  return (
    <Stack gap="lg">
      <TextInput
        placeholder={t`Search...`}
        leftSection={<Icon name="search" />}
        bdrs="sm"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <Card withBorder p={0}>
        {isLoading ? (
          <TreeTableSkeleton columnWidths={[0.4, 0.25, 0.15, 0.2]} />
        ) : (
          <TreeTable instance={treeTableInstance} emptyState={emptyState} />
        )}
      </Card>
    </Stack>
  );
}

const hasChannel = (subscription: DashboardSubscription) =>
  subscription.channels.length > 0;

// Like the dashboard's subscriptions sidebar, describe each subscription by
// its first channel
function getSubscriptionRow(
  subscription: DashboardSubscription,
): SubscriptionRow {
  const [channel] = subscription.channels;
  const slackChannel = channel.details?.channel;
  return {
    id: String(subscription.id),
    delivery: friendlySchedule(channel),
    icon: CHANNEL_ICONS[channel.channel_type] ?? "subscription",
    recipients:
      channel.channel_type === "email"
        ? buildRecipientText(subscription)
        : typeof slackChannel === "string"
          ? slackChannel
          : "",
    createdBy: subscription.creator?.common_name ?? "",
    createdAt: subscription.created_at,
  };
}
