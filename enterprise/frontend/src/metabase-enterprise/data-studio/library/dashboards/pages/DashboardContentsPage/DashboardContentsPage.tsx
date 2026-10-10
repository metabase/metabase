import { useMemo, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  Card,
  Center,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DashboardHeader } from "../../components/DashboardHeader";
import { useRouteDashboard } from "../../hooks/use-route-dashboard";

import { useContentColumns } from "./use-content-columns";
import {
  filterDashboardContentItems,
  getDashboardContentItemUrl,
  getDashboardContentItems,
  getDashcardCards,
} from "./utils";

export function DashboardContentsPage() {
  const { dashboard, isLoading, error } = useRouteDashboard();

  if (isLoading || error != null || dashboard == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="dashboard-contents-page">
      <DashboardHeader dashboard={dashboard} />
      <DashboardContents dashboard={dashboard} />
    </PageContainer>
  );
}

type DashboardContentsProps = {
  dashboard: Dashboard;
};

function DashboardContents({ dashboard }: DashboardContentsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const items = useMemo(
    () => getDashboardContentItems(getDashcardCards(dashboard)),
    [dashboard],
  );
  const filteredItems = useMemo(
    () => filterDashboardContentItems(items, searchQuery),
    [items, searchQuery],
  );
  const columns = useContentColumns(dashboard);
  const treeTableInstance = useTreeTableInstance({
    data: filteredItems,
    columns,
    getNodeId: (item) => String(item.id),
  });

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
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          emptyState={
            <ListEmptyState
              label={
                searchQuery
                  ? t`No results for "${searchQuery}"`
                  : t`This dashboard has no questions yet`
              }
            />
          }
          renderRowLink={(row, props) => (
            <Link to={getDashboardContentItemUrl(row.original)} {...props} />
          )}
        />
      </Card>
    </Stack>
  );
}
