import { useMemo, useState } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import {
  Card,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DashboardPageShell } from "../../components/DashboardPageShell";
import { getDashcardCards } from "../../utils";

import { ContentItemLink } from "./ContentItemLink";
import { useContentColumns } from "./use-content-columns";
import { filterDashboardContentItems, getDashboardContentItems } from "./utils";

export function DashboardContentsPage() {
  return (
    <DashboardPageShell data-testid="dashboard-contents-page">
      {(dashboard) => <DashboardContents dashboard={dashboard} />}
    </DashboardPageShell>
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
            <ContentItemLink item={row.original} {...props} />
          )}
        />
      </Card>
    </Stack>
  );
}
