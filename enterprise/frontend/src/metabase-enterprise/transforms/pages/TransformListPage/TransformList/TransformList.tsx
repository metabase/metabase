import type { Location } from "history";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "metabase/bench/components/ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "metabase/bench/components/ItemsListSection/ItemsListTreeNode";
import { useItemsListQuery } from "metabase/bench/components/ItemsListSection/useItemsListQuery";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import Link from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Tree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { useDispatch } from "metabase/lib/redux";
import { Box, FixedSizeIcon, Flex, NavLink, Text } from "metabase/ui";
import {
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type { Transform, TransformTag } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { TagList } from "../../../components/TagList";
import type { TransformListParams } from "../../../types";
import { getTransformUrl } from "../../../urls";
import { CreateTransformMenu } from "../CreateTransformMenu";
import { hasFilterParams } from "../utils";

const TransformsTreeNode = (props: TreeNodeProps) => (
  <ItemsListTreeNode
    {...props}
    renderLeaf={(item) => {
      const transform = item.data as Transform | undefined;
      if (!transform) {
        return;
      }
      return (
        <Box fw="normal" p="sm" style={{ overflow: "hidden" }} c="text-primary">
          <Text fz="xs" lh={1} c="text-secondary" mb="xs">
            {transform.name}
          </Text>
          <Flex align="center">
            <FixedSizeIcon
              name="enter_or_return"
              size={8}
              style={{ transform: "scaleX(-1)" }}
            />
            <FixedSizeIcon name="table2" ml="sm" />
            <Ellipsified ml="xs">{transform.target.name}</Ellipsified>
          </Flex>
        </Box>
      );
    }}
  />
);

const nameSorter = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name);

type TransformListProps = {
  params: TransformListParams;
  location: Location;
  selectedId?: Transform["id"];
  onCollapse?: () => void;
};

export function TransformList({
  params,
  location,
  selectedId,
  onCollapse,
}: TransformListProps) {
  const dispatch = useDispatch();
  const {
    data: transforms = [],
    isLoading: isLoadingTransforms,
    error: transformsError,
  } = useListTransformsQuery({
    last_run_start_time: params.lastRunStartTime,
    last_run_statuses: params.lastRunStatuses,
    tag_ids: params.tagIds,
  });
  const {
    data: tags = [],
    isLoading: isLoadingTags,
    error: tagsError,
  } = useListTransformTagsQuery();
  const { data: databaseData } = useListDatabasesQuery();
  const isLoading = isLoadingTransforms || isLoadingTags;
  const error = transformsError ?? tagsError;
  const transformsSorted = useMemo(
    () => [...transforms].sort(nameSorter),
    [transforms],
  );

  const listSettingsProps = useItemsListQuery({
    settings: [
      {
        name: "display",
        options: [
          {
            label: t`Target table`,
            value: "tree",
          },
          {
            label: t`Alphabetical`,
            value: "alphabetical",
          },
        ],
      },
    ],
    defaults: { display: "tree" },
    location,
  });
  const treeData = useMemo((): ITreeNodeItem[] => {
    if (!databaseData || !transformsSorted) {
      return [];
    }
    type Tier<T> = (t: T) => ITreeNodeItem;
    const tiers: Tier<Transform>[] = [
      ({ target }) => ({
        id: `database-${target.database}`,
        name:
          databaseData.data.find((d) => d.id === target.database)?.name ||
          t`Unknown database`,
        icon: "database",
      }),
      ({ target }) => ({
        id: `schema-${target.database}-${target.schema}`,
        name: target.schema || t`Unknown schema`,
        icon: "folder",
      }),
    ];
    const nodes: Record<string | number, ITreeNodeItem> = {};
    const root: ITreeNodeItem = {
      id: "root",
      name: "root",
      icon: "empty",
      children: [],
    };
    transformsSorted.forEach((transform) => {
      let prev = root;
      tiers.forEach((tier) => {
        let node = tier(transform);
        const existingNode = nodes[node.id];
        if (!existingNode) {
          node = { ...node, children: [] };
          nodes[node.id] = node;
          prev.children?.push(node);
        } else {
          node = existingNode;
        }
        prev = node;
      });
      prev.children?.push({
        id: transform.id,
        name: transform.name,
        icon: "table2",
        data: transform,
      });
    });
    const recursiveAlpha = (node: ITreeNodeItem) => {
      node.children?.sort(nameSorter);
      node.children?.forEach(recursiveAlpha);
      return node;
    };
    return recursiveAlpha(root).children || [];
  }, [databaseData, transformsSorted]);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ItemsListSection
      sectionTitle={t`Transforms`}
      onCollapse={onCollapse}
      addButton={<CreateTransformMenu />}
      settings={<ItemsListSettings {...listSettingsProps} />}
      listItems={
        transforms.length === 0 ? (
          <ListEmptyState
            label={
              hasFilterParams(params)
                ? t`No transforms found`
                : t`No transforms yet`
            }
          />
        ) : listSettingsProps.values.display === "tree" ? (
          <Box mx="-sm">
            <Tree
              initiallyExpanded
              data={treeData}
              selectedId={selectedId}
              onSelect={(node) => {
                if (typeof node.id === "number") {
                  dispatch(push(`/bench/transforms/${node.id}`));
                }
              }}
              TreeNode={TransformsTreeNode}
            />
          </Box>
        ) : (
          <Box>
            {transformsSorted.map((transform) => (
              <TransformListItem
                key={transform.id}
                transform={transform}
                tags={tags}
                isActive={transform.id === selectedId}
              />
            ))}
          </Box>
        )
      }
    />
  );
}

function TransformListItem({
  transform,
  tags,
  isActive,
}: {
  transform: Transform;
  tags: TransformTag[];
  isActive?: boolean;
}) {
  return (
    <NavLink
      component={Link}
      to={(loc) => ({ ...loc, pathname: getTransformUrl(transform.id) })}
      active={isActive}
      w="100%"
      label={
        <Box>
          <Text fw="bold">{transform.name}</Text>
          <Box c="text-light" fz="sm" mb="xs" ff="monospace">
            {transform.target.name}
          </Box>
          <TagList tags={tags} tagIds={transform.tag_ids ?? []} />
        </Box>
      }
    />
  );
}
