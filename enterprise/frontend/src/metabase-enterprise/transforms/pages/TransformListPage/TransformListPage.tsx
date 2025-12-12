import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useLocation } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import DateTime from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { TreeColumnDef } from "metabase/ui";
import {
  Card,
  Flex,
  Group,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  useTreeTable,
} from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { CreateTransformMenu } from "metabase-enterprise/transforms/components/CreateTransformMenu";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { ListLoadingState } from "metabase-enterprise/transforms/components/ListLoadingState";
import type { Collection, Transform } from "metabase-types/api";

type TreeNodeType = "folder" | "transform";

type TreeNode = {
  id: string;
  name: string;
  nodeType: TreeNodeType;
  updated_at?: string;
  target?: Transform["target"];
  children?: TreeNode[];
  transformId?: number;
};

function buildTreeData(
  collections: Collection[] | undefined,
  transforms: Transform[] | undefined,
): TreeNode[] {
  if (!collections && !transforms) {
    return [];
  }

  const transformsByCollectionId = new Map<number | null, Transform[]>();
  for (const transform of transforms ?? []) {
    const collectionId = transform.collection_id;
    if (!transformsByCollectionId.has(collectionId)) {
      transformsByCollectionId.set(collectionId, []);
    }
    transformsByCollectionId.get(collectionId)!.push(transform);
  }

  function buildCollectionNode(collection: Collection): TreeNode {
    const childFolders = (collection.children ?? []).map(buildCollectionNode);
    const childTransforms = (
      transformsByCollectionId.get(collection.id as number) ?? []
    ).map(
      (transform): TreeNode => ({
        id: `transform-${transform.id}`,
        name: transform.name,
        nodeType: "transform",
        updated_at: transform.updated_at,
        target: transform.target,
        transformId: transform.id,
      }),
    );

    return {
      id: `collection-${collection.id}`,
      name: collection.name,
      nodeType: "folder",
      children: [...childFolders, ...childTransforms],
    };
  }

  const rootFolders = (collections ?? []).map(buildCollectionNode);

  const rootTransforms = (transformsByCollectionId.get(null) ?? []).map(
    (transform): TreeNode => ({
      id: `transform-${transform.id}`,
      name: transform.name,
      nodeType: "transform",
      updated_at: transform.updated_at,
      target: transform.target,
      transformId: transform.id,
    }),
  );

  return [...rootFolders, ...rootTransforms];
}

function filterTreeNodes(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) {
    return nodes;
  }

  const lowerQuery = query.toLowerCase();

  function nodeMatches(node: TreeNode): boolean {
    if (node.name.toLowerCase().includes(lowerQuery)) {
      return true;
    }
    if (
      node.nodeType === "transform" &&
      node.target?.name.toLowerCase().includes(lowerQuery)
    ) {
      return true;
    }
    return false;
  }

  function filterNode(node: TreeNode): TreeNode | null {
    if (node.nodeType === "transform") {
      return nodeMatches(node) ? node : null;
    }

    const filteredChildren = (node.children ?? [])
      .map(filterNode)
      .filter((child): child is TreeNode => child !== null);

    if (nodeMatches(node) || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  }

  return nodes
    .map(filterNode)
    .filter((node): node is TreeNode => node !== null);
}

export const TransformListPage = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const [hasScrolled, setHasScrolled] = useState(false);

  const searchParams = new URLSearchParams(location.search ?? "");
  const collectionIdParam = searchParams.get("collectionId");
  const targetCollectionId = collectionIdParam
    ? parseInt(collectionIdParam, 10)
    : null;

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

  const isLoading = isLoadingCollections || isLoadingTransforms;
  const error = collectionsError ?? transformsError;

  const treeData = useMemo(() => {
    const allData = buildTreeData(collections, transforms);
    return filterTreeNodes(allData, debouncedSearchQuery);
  }, [collections, transforms, debouncedSearchQuery]);

  const defaultExpandedIds = useMemo(() => {
    if (!targetCollection) {
      return undefined;
    }
    const ids = new Set<string>();
    const ancestors = targetCollection.effective_ancestors ?? [];
    for (const ancestor of ancestors.slice(1)) {
      ids.add(`collection-${ancestor.id}`);
    }
    ids.add(`collection-${targetCollection.id}`);
    return ids;
  }, [targetCollection]);

  const columnDefs = useMemo<TreeColumnDef<TreeNode>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        grow: true,
        cell: ({ node }) => (
          <Group data-testid="tree-node-name" gap="sm">
            <Icon
              name={node.data.nodeType === "folder" ? "folder" : "transform"}
              c={node.data.nodeType === "folder" ? "text-medium" : "brand"}
            />
            {node.data.name}
          </Group>
        ),
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: t`Last Modified`,
        size: 220,
        cell: ({ node }) =>
          node.data.updated_at ? (
            <DateTime value={node.data.updated_at} />
          ) : null,
      },
      {
        id: "output_table",
        accessorFn: (node) => node.target?.name ?? "",
        header: t`Output table`,
        size: 200,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTable({
    data: treeData,
    columns: columnDefs,
    getNodeId: (node) => node.id,
    getChildren: (node) => node.children,
    isExpandable: (node) =>
      node.nodeType === "folder" && (node.children?.length ?? 0) > 0,
    defaultExpandedIds,
  });

  useEffect(() => {
    if (targetCollectionId && !hasScrolled && !isLoading) {
      const nodeId = `collection-${targetCollectionId}`;
      treeTableInstance.virtualization.scrollToNode(nodeId);
      setHasScrolled(true);
    }
  }, [targetCollectionId, hasScrolled, isLoading, treeTableInstance]);

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const handleRowClick = (node: TreeNode) => {
    if (node.nodeType === "transform" && node.transformId !== undefined) {
      dispatch(push(Urls.transform(node.transformId)));
    }
  };

  const isEmpty = treeData.length === 0;

  return (
    <>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
        px="3.5rem"
        showMetabotButton
        py={0}
      />
      <Stack
        bg="background-light"
        data-testid="transforms-list"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <Flex gap="md">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <CreateTransformMenu />
        </Flex>

        <Card withBorder p={0}>
          {isLoading ? (
            <ListLoadingState />
          ) : isEmpty ? (
            <ListEmptyState
              label={
                debouncedSearchQuery
                  ? t`No transforms found`
                  : t`No transforms yet`
              }
            />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              onRowClick={(node) => {
                if (node.hasChildren) {
                  treeTableInstance.expansion.toggle(node.id);
                } else {
                  handleRowClick(node.data);
                }
              }}
            />
          )}
        </Card>
      </Stack>
    </>
  );
};
