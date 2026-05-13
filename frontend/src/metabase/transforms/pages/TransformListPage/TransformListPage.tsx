import type { Row } from "@tanstack/react-table";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
  useListTransformsQuery,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import {
  PLUGIN_REPLACEMENT,
  PLUGIN_TRANSFORM_OPTIMIZER,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { LockedTransformsBanner } from "metabase/transforms/components/LockedTransformsBanner/LockedTransformsBanner";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { getShouldShowPythonTransformsUpsell } from "metabase/transforms/selectors";
import { Ellipsified } from "metabase/ui";
import {
  Box,
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Stack,
  TextInput,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import * as Urls from "metabase/urls";
import { type NamedUser, getUserName } from "metabase/utils/user";

import { CollectionRowMenu } from "./CollectionRowMenu";
import { CreateTransformMenu } from "./CreateTransformMenu";
import S from "./TransformListPage.module.css";
import { type TreeNode, getCollectionNodeId, isCollectionNode } from "./types";
import {
  buildTreeData,
  getDefaultExpandedIds,
  useGetTransformWarnings,
} from "./utils";

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

function getLastRunDurationMs(transform: {
  last_run?: { start_time: string; end_time: string | null } | null;
}): number | null {
  const run = transform.last_run;
  if (!run?.start_time || !run.end_time) {
    return null;
  }
  const start = Date.parse(run.start_time);
  const end = Date.parse(run.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  const diff = end - start;
  return diff >= 0 ? diff : null;
}
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

type TransformListPageProps = WithRouterProps & PropsWithChildren;

export const TransformListPage = ({
  children,
  location,
}: TransformListPageProps) => {
  const { transformsDatabases = [], isLoadingDatabases } =
    useTransformPermissions();
  const targetCollectionId =
    Urls.extractEntityId(location.query?.collectionId) ?? null;
  const hasScrolledRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Threshold (in seconds) for the optional "find slow" filter — only
  // transforms whose `last_run` duration is at least this many seconds
  // appear in the tree. `undefined` means no threshold (show everything).
  const [slowThresholdSec, setSlowThresholdSec] = useState<number | undefined>(
    undefined,
  );
  const hasPythonTransformsFeature = useHasTokenFeature("transforms-python");
  const isMeterLocked = useSetting("transforms-meter-locked");

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
  const shouldShowPythonTransformsUpsell = useSelector(
    getShouldShowPythonTransformsUpsell,
  );

  const warningsByTransformId = useGetTransformWarnings(transforms);

  // Transforms whose last_run wall-clock duration meets `slowThresholdSec`.
  // We do this client-side: the transforms list endpoint already hydrates
  // last_run, so an extra request isn't needed. In-progress runs (no
  // end_time) are excluded — we can only score runs that finished.
  const matchingSlowTransformIds = useMemo(() => {
    if (slowThresholdSec == null) {
      return [];
    }
    const minMs = slowThresholdSec * 1000;
    return (transforms ?? []).reduce<number[]>((acc, t) => {
      const ms = getLastRunDurationMs(t);
      if (ms != null && ms >= minMs) {
        acc.push(t.id);
      }
      return acc;
    }, []);
  }, [slowThresholdSec, transforms]);

  const visibleTransforms = useMemo(() => {
    if (slowThresholdSec == null) {
      return transforms;
    }
    const matching = new Set(matchingSlowTransformIds);
    return (transforms ?? []).filter((t) => matching.has(t.id));
  }, [transforms, matchingSlowTransformIds, slowThresholdSec]);

  const treeData = useMemo(() => {
    // When the slow filter is on, hide collections — show a flat list of
    // matching transforms so the user can scan the hits directly.
    const data = buildTreeData(
      slowThresholdSec == null ? collections : [],
      visibleTransforms,
    );

    // It will trigger the upsell modal if the feature isn't enabled.
    const shouldShowPythonLibraryRow =
      hasPythonTransformsFeature || shouldShowPythonTransformsUpsell;

    if (shouldShowPythonLibraryRow) {
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
  }, [
    collections,
    hasPythonTransformsFeature,
    shouldShowPythonTransformsUpsell,
    slowThresholdSec,
    transformsDatabases.length,
    visibleTransforms,
  ]);

  const defaultExpanded = useMemo(
    () => getDefaultExpandedIds(targetCollectionId, targetCollection),
    [targetCollectionId, targetCollection],
  );

  const columnDefs = useMemo<TreeTableColumnDef<TreeNode>[]>(() => {
    return [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 280,
        maxAutoWidth: 800,
        enableSorting: true,
        cell: ({ row }) =>
          getNameCell({
            row,
            hasPythonTransformsFeature,
            warningsByTransformId,
          }),
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
              collection={row.original.collection}
              transformCount={countTransforms(row.original)}
            />
          ) : null,
      },
    ];
  }, [hasPythonTransformsFeature, warningsByTransformId]);

  const getRowHref = useCallback((row: Row<TreeNode>) => {
    if (isRowDisabled(row)) {
      return null;
    }
    if (row.original.nodeType === "transform" && row.original.transformId) {
      return Urls.transform(row.original.transformId);
    }
    if (row.original.nodeType === "library" && row.original.url) {
      return row.original.url;
    }
    return null;
  }, []);

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

  const handleRowClick = useCallback((row: Row<TreeNode>) => {
    // Navigation for leaf nodes (transforms, library) is handled by the link
    if (row.getCanExpand()) {
      row.toggleExpanded();
    }
  }, []);

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
    ? slowThresholdSec != null
      ? t`No transforms took at least ${slowThresholdSec}s on their last run.`
      : t`No transforms yet`
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
        {isMeterLocked && <LockedTransformsBanner />}
        <Flex gap="md">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {PLUGIN_TRANSFORM_OPTIMIZER.FindSlowTool && (
            <PLUGIN_TRANSFORM_OPTIMIZER.FindSlowTool
              thresholdSec={slowThresholdSec}
              onThresholdChange={setSlowThresholdSec}
              matchingTransformIds={matchingSlowTransformIds}
            />
          )}
          {transformsDatabases.length > 0 && (
            <>
              <CreateTransformMenu />
              <PLUGIN_REPLACEMENT.TransformToolsMenu />
            </>
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
      {children}
    </PageContainer>
  );
};

function getNameCell({
  row,
  hasPythonTransformsFeature,
  warningsByTransformId,
}: {
  row: Row<TreeNode>;
  hasPythonTransformsFeature: boolean;
  warningsByTransformId: Map<number, string>;
}) {
  const getTooltipProps = (message: string | undefined) => {
    if (!message) {
      return undefined;
    }

    return {
      alwaysShowTooltip: true,
      tooltipProps: {
        openDelay: 300,
        label: message,
      },
    };
  };

  const getWarningMessage = () => {
    if (isRowDisabled(row)) {
      return t`Sorry, you don’t have permission to see that.`;
    }

    if (row.original.transformId) {
      return warningsByTransformId.get(row.original.transformId);
    }
    return undefined;
  };

  const isLibraryWithoutFeature =
    row.original.nodeType === "library" && !hasPythonTransformsFeature;

  const hasWarning = !!getWarningMessage();

  // Optimized transforms swap the regular icon for the Sonic gif so the
  // celebratory state is visible at-a-glance in the list. Warning icon still
  // wins over the gif — if something is broken, that's more important to see.
  const useSonicIcon = !hasWarning && row.original.optimized === true;

  return (
    <Group gap="sm" wrap="nowrap" miw={0}>
      {useSonicIcon && (
        <Tooltip label={t`Fully optimized`}>
          <Box
            component="img"
            src="app/assets/img/sonic-gotta-go-fast.gif"
            alt={t`Fully optimized`}
            h={20}
            w={20}
            style={{ objectFit: "contain", flexShrink: 0 }}
            data-testid="transform-optimized-badge"
          />
        </Tooltip>
      )}
      <EntityNameCell
        data-testid="tree-node-name"
        icon={useSonicIcon ? undefined : hasWarning ? "warning" : row.original.icon}
        iconColor={hasWarning ? "warning" : getNodeIconColor(row.original)}
        name={row.original.name}
        ellipsifiedProps={{ ...getTooltipProps(getWarningMessage()) }}
      />
      {isLibraryWithoutFeature && <UpsellGem.New size={14} />}
    </Group>
  );
}
