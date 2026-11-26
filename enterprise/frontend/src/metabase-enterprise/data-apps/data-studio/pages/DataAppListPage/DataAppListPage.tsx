import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { SimpleGuideCard } from "metabase/prototypes/data-apps-discoverability/guide/SimpleGuideCard";
import { getSimulatedDataApps } from "metabase/prototypes/data-apps-discoverability/simulated-data-apps";
import {
  useGuideLayout,
  useSimulatedDataApps,
} from "metabase/prototypes/data-apps-discoverability/use-discovery-variant";
import { useNavigate } from "metabase/router";
import {
  Card,
  Ellipsified,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListDataAppsQuery } from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";

import { getDataAppStatusLabel } from "../../../utils";
import { DataAppMoreMenu } from "../../components/DataAppMoreMenu";

import { DataAppBuildGuide } from "./DataAppBuildGuide";
import { DataAppListEmptyState } from "./DataAppListEmptyState";

export function DataAppListPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const realAppsQuery = useListDataAppsQuery();
  const { layout: guideLayout } = useGuideLayout();
  // PROTOTYPE: the picker can swap the real list for five fake apps, or for none.
  const { simulation } = useSimulatedDataApps();
  const isSimulated = simulation !== "real";
  const apps = useMemo(
    () => getSimulatedDataApps(simulation, realAppsQuery.data ?? []),
    [simulation, realAppsQuery.data],
  );
  const isLoading = !isSimulated && realAppsQuery.isLoading;
  const error = isSimulated ? undefined : realAppsQuery.error;

  const handleRowActivate = useCallback(
    (row: { original: DataApp }) => {
      navigate(Urls.dataStudioDataApp(row.original.slug));
    },
    [navigate],
  );

  const columns = useMemo<TreeTableColumnDef<DataApp>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 160,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
      {
        id: "address",
        accessorFn: (app) => Urls.dataApp(app.slug),
        header: t`Address`,
        minWidth: 160,
        cell: ({ row }) => (
          <Ellipsified>{Urls.dataApp(row.original.slug)}</Ellipsified>
        ),
      },
      {
        id: "status",
        accessorFn: (app) => getDataAppStatusLabel(app),
        header: t`Status`,
        minWidth: 120,
        cell: ({ row }) => getDataAppStatusLabel(row.original),
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: t`Last synced`,
        minWidth: 160,
        cell: ({ row }) => <DateTime value={row.original.updated_at} />,
      },
      {
        id: "actions",
        header: "",
        width: 48,
        cell: ({ row }) => <DataAppMoreMenu app={row.original} />,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: apps,
    columns,
    getNodeId: (app) => app.slug,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    onRowActivate: handleRowActivate,
  });

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const isEmpty = !isLoading && apps.length === 0;

  return (
    <PageContainer data-testid="data-app-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Data apps`}</DataStudioBreadcrumbs>
        }
      />
      {isEmpty && guideLayout === "simple" ? (
        // PROTOTYPE: the simple guide stands in for the empty state.
        <SimpleGuideCard />
      ) : isEmpty ? (
        <DataAppListEmptyState />
      ) : (
        <Stack style={{ overflow: "hidden" }}>
          {!isLoading && <DataAppBuildGuide />}
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Flex direction="column" flex={1} mih={0}>
            <Card withBorder p={0}>
              {isLoading ? (
                <TreeTableSkeleton columnWidths={[0.3, 0.3, 0.15, 0.2, 0.05]} />
              ) : (
                <TreeTable
                  instance={treeTableInstance}
                  emptyState={
                    searchQuery ? (
                      <ListEmptyState label={t`No data apps found`} />
                    ) : null
                  }
                  onRowClick={handleRowActivate}
                />
              )}
            </Card>
          </Flex>
        </Stack>
      )}
    </PageContainer>
  );
}
