import { useDisclosure } from "@mantine/hooks";
import type { Row } from "@tanstack/react-table";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
  useListTransformsQuery,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import type { ColorName } from "metabase/lib/colors/types";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { type NamedUser, getUserName } from "metabase/lib/user";
import { PLUGIN_REMOTE_SYNC, PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { CreateTransformMenu } from "metabase/transforms/components/CreateTransformMenu";
import { ListEmptyState } from "metabase/transforms/components/ListEmptyState";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { PythonTransformsUpsellModal } from "metabase/transforms/upsells/components";
import {
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";

import { CollectionRowMenu } from "./CollectionRowMenu";
import S from "./TransformListPage.module.css";
import { type TreeNode, getCollectionNodeId, isCollectionNode } from "./types";
import { buildTreeData, getDefaultExpandedIds } from "./utils";

const getNodeId = (node: TreeNode) => node.id;
const getSubRows = (node: TreeNode) => node.children;
const isFilterable = (node: TreeNode) => node.nodeType === "transform";

const countTransforms = (node: TreeNode): number => {
  if (!node.children) {
    return 0;
  }
  return node.children.reduce((count, child) => {
    if (child.nodeType === "transform") {
      return count + 1;
    }
    return count + countTransforms(child);
  }, 0);
};

const isRowDisabled = (row: Row<TreeNode>) => {
  return row.original.source_readable === false;
};

const NODE_ICON_COLORS: Record<TreeNode["nodeType"], ColorName> = {
  folder: "text-secondary",
  transform: "brand",
  library: "text-primary",
};

const getNodeIconColor = (node: TreeNode) => NODE_ICON_COLORS[node.nodeType];
const globalFilterFn = (
  row: { original: TreeNode },
  _columnId: string,
  filterValue: string,
) => {
  if (row.original.nodeType !== "transform") {
    return false;
  }
  const query = String(filterValue).toLowerCase();
  return (
    row.original.name.toLowerCase().includes(query) ||
    (row.original.target?.name.toLowerCase().includes(query) ?? false)
  );
};

export const TransformListPage = ({ location }: WithRouterProps) => {
  const { transformsDatabases = [], isLoadingDatabases } =
    useTransformPermissions();
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const targetCollectionId =
    Urls.extractEntityId(location.query?.collectionId) ?? null;
  const hasScrolledRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [
    isPythonUpsellOpened,
    { open: openPythonUpsell, close: closePythonUpsell },
  ] = useDisclosure(false);
  const hasPythonTransformsFeature = useHasTokenFeature("transforms-python");

  const { data: targetCollection } = useGetCollectionQuery(
    targetCollectionId
      ? { id: targetCollectionId, namespace: "transforms" }
      : skipToken,
  );

  const {
    data: collections,
    error: collectionsError,
    isLoading: isLoadingCollections,
  } = useListCollectionsTreeQuery({
    namespace: "transforms",
    "exclude-archived": true,
  });

  const {
    data: transforms,
    error: transformsError,
    isLoading: isLoadingTransforms,
  } = useListTransformsQuery({});

  const isLoading =
    isLoadingCollections || isLoadingTransforms || isLoadingDatabases;
  const error = collectionsError ?? transformsError;

  const treeData = useMemo(() => {
    const data = buildTreeData(collections, transforms);
    // Only show Python library item if there's at least one item in the table
    // It will trigger upsell if feature isn't enabled
    if (data.length > 0) {
      data.push({
        id: "library",
        name: t`Python library`,
        nodeType: "library",
        icon: "snippet",
        url: Urls.transformPythonLibrary({
          path: PLUGIN_TRANSFORMS_PYTHON.sharedLibImportPath,
        }),
        source_readable: transformsDatabases.length > 0,
      });
    }
    return data;
  }, [collections, transforms, transformsDatabases]);

  const defaultExpanded = useMemo(
    () => getDefaultExpandedIds(targetCollectionId, targetCollection),
    [targetCollectionId, targetCollection],
  );

  const columnDefs = useMemo<TreeTableColumnDef<TreeNode>[]>(() => {
    type EllipsifiedProps = ComponentProps<
      typeof EntityNameCell
    >["ellipsifiedProps"];
    const unreadableTransformEllipsifiedProps: EllipsifiedProps = {
      alwaysShowTooltip: true,
      tooltipProps: {
        openDelay: 300,
        label: t`Sorry, you don’t have permission to see that.`,
      },
    };
    return [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 280,
        maxAutoWidth: 800,
        enableSorting: true,
        cell: ({ row }) => {
          const isLibraryWithoutFeature =
            row.original.nodeType === "library" && !hasPythonTransformsFeature;
          return (
            <Group gap="sm" wrap="nowrap" miw={0}>
              <EntityNameCell
                data-testid="tree-node-name"
                icon={row.original.icon}
                iconColor={getNodeIconColor(row.original)}
                name={row.original.name}
                ellipsifiedProps={
                  isRowDisabled(row)
                    ? unreadableTransformEllipsifiedProps
                    : undefined
                }
              />
              {isLibraryWithoutFeature && <UpsellGem.New size={14} />}
            </Group>
          );
        },
      },
      {
        id: "owner",
        accessorFn: (node) => {
          const owner = node.owner;
          if (owner) {
            return owner.first_name && owner.last_name
              ? `${owner.first_name} ${owner.last_name}`
              : owner.email;
          }
          return node.owner_email ?? "";
        },
        header: t`Owner`,
        minWidth: 160,
        enableSorting: true,
        cell: ({ row }) => {
          const owner = row.original.owner;
          const hasUserName = owner?.first_name || owner?.last_name;

          if (hasUserName) {
            const displayName = getUserName(owner as NamedUser);
            return <Ellipsified>{displayName}</Ellipsified>;
          }

          const ownerEmail = row.original.owner_email ?? owner?.email;
          if (ownerEmail) {
            return <Ellipsified>{ownerEmail}</Ellipsified>;
          }

          return null;
        },
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: t`Last Modified`,
        maxWidth: 200,
        minWidth: "auto",
        enableSorting: true,
        sortingFn: "datetime",
        sortDescFirst: true,
        cell: ({ row }) =>
          row.original.updated_at ? (
            <DateTime value={row.original.updated_at} />
          ) : null,
      },
      {
        id: "output_table",
        accessorFn: (node) => node.target?.name ?? "",
        header: t`Output table`,
        minWidth: 200,
        maxAutoWidth: 800,
        enableSorting: true,
        cell: ({ row }) =>
          row.original.target?.name ? (
            <Ellipsified>{row.original.target.name}</Ellipsified>
          ) : null,
      },
      {
        id: "actions",
        header: "",
        width: 48,
        enableSorting: false,
        cell: ({ row }) =>
          isCollectionNode(row.original) ? (
            <CollectionRowMenu
              collectionId={row.original.collectionId}
              collectionName={row.original.name}
              transformCount={countTransforms(row.original)}
            />
          ) : null,
      },
    ];
  }, [hasPythonTransformsFeature]);

  const getRowHref = useCallback(
    (row: Row<TreeNode>) => {
      if (isRowDisabled(row)) {
        return null;
      }
      if (row.original.nodeType === "transform" && row.original.transformId) {
        return Urls.transform(row.original.transformId);
      }
      if (
        row.original.nodeType === "library" &&
        row.original.url &&
        hasPythonTransformsFeature
      ) {
        return row.original.url;
      }
      return null;
    },
    [hasPythonTransformsFeature],
  );

  const treeTableInstance = useTreeTableInstance({
    data: treeData,
    columns: columnDefs,
    getNodeId,
    getSubRows,
    defaultExpanded,
    expanded: searchQuery ? true : undefined,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
    isFilterable,
  });

  const handleRowClick = useCallback(
    (row: Row<TreeNode>) => {
      // If clicking on library without feature, show upsell modal
      if (row.original.nodeType === "library" && !hasPythonTransformsFeature) {
        openPythonUpsell();
        return;
      }
      // Navigation for leaf nodes (transforms, library) is handled by the link
      if (row.getCanExpand()) {
        row.toggleExpanded();
      }
    },
    [hasPythonTransformsFeature, openPythonUpsell],
  );

  useEffect(() => {
    if (targetCollectionId && !hasScrolledRef.current && !isLoading) {
      const nodeId = getCollectionNodeId(targetCollectionId);
      treeTableInstance.scrollToNode(nodeId);
      hasScrolledRef.current = true;
    }
  }, [targetCollectionId, isLoading, treeTableInstance]);

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const hasNoData = treeData.length === 0;
  const hasNoResults = !hasNoData && treeTableInstance.rows.length === 0;

  const emptyMessage = hasNoData
    ? t`No transforms yet`
    : hasNoResults && searchQuery
      ? t`No transforms found`
      : null;

  return (
    <PageContainer data-testid="transforms-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
        showMetabotButton
        py={0}
      />
      <Stack className={CS.overflowHidden}>
        <Flex gap="md">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {!isRemoteSyncReadOnly && transformsDatabases.length > 0 && (
            <CreateTransformMenu />
          )}
        </Flex>

        <Card withBorder p={0}>
          {isLoading ? (
            <TreeTableSkeleton columnWidths={[0.35, 0.15, 0.15, 0.2, 0.05]} />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              emptyState={
                emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
              }
              onRowClick={handleRowClick}
              isRowDisabled={isRowDisabled}
              getRowHref={getRowHref}
              classNames={{ rowDisabled: S.rowDisabled }}
            />
          )}
        </Card>
      </Stack>
      <PythonTransformsUpsellModal
        isOpen={isPythonUpsellOpened}
        onClose={closePythonUpsell}
      />
    </PageContainer>
  );
};
