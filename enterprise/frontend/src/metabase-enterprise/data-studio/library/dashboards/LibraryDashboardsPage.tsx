import type { Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  useListCollectionsTreeQuery,
  useListDashboardsQuery,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import {
  isLibraryDashboardsCollection,
  useCanUseLibraryDashboards,
  useCreateLibraryDashboardsCollection,
} from "metabase/common/data-studio/library-dashboards";
import { useHasTokenFeature } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages";
import { usePageTitle } from "metabase/hooks/use-page-title";
import {
  Card,
  EntityNameCell,
  Flex,
  Icon,
  type RenderRowLink,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import { LibraryDashboardRowMenu } from "./LibraryDashboardRowMenu";
import { LibraryDashboardsCreateMenu } from "./LibraryDashboardsCreateMenu";
import {
  type DashboardTreeNode,
  buildDashboardTree,
  getSubtreeCollectionIds,
  groupDashboardsByCollectionId,
} from "./utils";

const getNodeId = (node: DashboardTreeNode) => node.id;
const getSubRows = (node: DashboardTreeNode) => node.children;
const isFilterable = (node: DashboardTreeNode) => node.model === "dashboard";
const globalFilterFn = (
  row: { original: DashboardTreeNode },
  _columnId: string,
  filterValue: string,
) =>
  row.original.model === "dashboard" &&
  row.original.name.toLowerCase().includes(String(filterValue).toLowerCase());

const renderRowLink: RenderRowLink<DashboardTreeNode> = (row, props) =>
  row.original.model === "dashboard" ? (
    <Link
      to={Urls.dataStudioLibraryDashboard(row.original.dashboard.id)}
      {...props}
    />
  ) : (
    props.children
  );

export function LibraryDashboardsPage() {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <LibraryDashboardsPageContent />;
}

function LibraryDashboardsPageContent() {
  usePageTitle(t`Dashboards`);

  const [searchQuery, setSearchQuery] = useState("");
  const canUseLibraryDashboards = useCanUseLibraryDashboards();

  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    });
  const { data: dashboards = [], isLoading: isLoadingDashboards } =
    useListDashboardsQuery({ f: "all" });

  const rootCollection = useMemo(
    () => collections.find(isLibraryDashboardsCollection),
    [collections],
  );

  useEnsureLibraryDashboardsCollection({
    shouldCreate:
      canUseLibraryDashboards && !isLoadingCollections && !rootCollection,
  });

  const treeData = useMemo(() => {
    if (!rootCollection) {
      return [];
    }
    const collectionIds = getSubtreeCollectionIds(rootCollection);
    return buildDashboardTree(
      rootCollection,
      groupDashboardsByCollectionId(dashboards, collectionIds),
    );
  }, [rootCollection, dashboards]);

  const columns = useMemo<TreeTableColumnDef<DashboardTreeNode>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        accessorKey: "name",
        enableSorting: true,
        minWidth: 200,
        cell: ({ row }) => (
          <EntityNameCell
            data-testid={`${row.original.model}-name`}
            icon={row.original.icon}
            name={row.original.name}
          />
        ),
      },
      {
        id: "updatedAt",
        header: t`Updated At`,
        accessorKey: "updatedAt",
        enableSorting: true,
        sortingFn: "datetime",
        width: "auto",
        widthPadding: 20,
        cell: ({ row }) =>
          row.original.updatedAt ? (
            <DateTime value={row.original.updatedAt} />
          ) : null,
      },
      {
        id: "actions",
        width: 48,
        cell: ({ row }) => (
          <LibraryDashboardRowMenu
            node={row.original}
            parentCollection={row.original.parent}
          />
        ),
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: treeData,
    columns,
    getNodeId,
    getSubRows,
    getRowCanExpand: (row) =>
      row.original.model === "collection" &&
      (row.original.children?.length ?? 0) > 0,
    expanded: searchQuery ? true : undefined,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
    isFilterable,
  });

  const handleRowClick = useCallback((row: Row<DashboardTreeNode>) => {
    // Dashboards navigate via the row link
    if (row.getCanExpand()) {
      row.toggleExpanded();
    }
  }, []);

  const isLoading =
    isLoadingCollections || isLoadingDashboards || !rootCollection;
  const hasNoData = treeData.length === 0;
  const emptyMessage = hasNoData
    ? t`No dashboards yet`
    : searchQuery && treeTableInstance.rows.length === 0
      ? t`No results for "${searchQuery}"`
      : null;

  return (
    <SectionLayout>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Dashboards`}</DataStudioBreadcrumbs>
        }
        px="3.5rem"
        py={0}
      />
      <Stack
        bg="background_page-secondary"
        data-testid="library-dashboards-page"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <Flex gap="lg">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="sm"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {rootCollection?.can_write && (
            <LibraryDashboardsCreateMenu rootCollectionId={rootCollection.id} />
          )}
        </Flex>
        <Card withBorder p={0}>
          {isLoading && canUseLibraryDashboards ? (
            <TreeTableSkeleton columnWidths={[0.6, 0.2, 0.05]} />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              emptyState={
                emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
              }
              onRowClick={handleRowClick}
              renderRowLink={renderRowLink}
            />
          )}
        </Card>
      </Stack>
    </SectionLayout>
  );
}

/**
 * PROTOTYPE: lazily create the collection that backs Library › Dashboards the
 * first time an admin or analyst visits this page.
 */
function useEnsureLibraryDashboardsCollection({
  shouldCreate,
}: {
  shouldCreate: boolean;
}) {
  const [createCollection] = useCreateLibraryDashboardsCollection();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (shouldCreate && !hasRequestedRef.current) {
      hasRequestedRef.current = true;
      createCollection().catch(() => {
        hasRequestedRef.current = false;
      });
    }
  }, [shouldCreate, createCollection]);
}
