import { useMemo } from "react";
import { push } from "react-router-redux";
import { useLocalStorage } from "react-use";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "metabase/bench/components/ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "metabase/bench/components/ItemsListSection/ItemsListTreeNode";
import {
  BenchFlatListItem,
  BenchFlatListItemContent,
} from "metabase/bench/components/shared/BenchFlatListItem";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Tree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { useDispatch } from "metabase/lib/redux";
import { Box } from "metabase/ui";
import {
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type { Transform, TransformTag } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { getTagById, getTagList } from "../../../components/TagList";
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
        <Box p="sm" style={{ overflow: "hidden" }}>
          <BenchFlatListItemContent
            label={transform.name}
            icon="table2"
            subtitle={transform.target.name}
            isActive={props.isSelected}
          />
        </Box>
      );
    }}
  />
);

const nameSorter = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name);

const lastModifiedSorter = <T extends { updated_at: string }>(a: T, b: T) =>
  a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;

type TransformListProps = {
  params: TransformListParams;
  selectedId?: Transform["id"];
  onCollapse?: () => void;
};

export function TransformList({
  params,
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

  const [display = "tree", setDisplay] = useLocalStorage<
    "tree" | "alphabetical" | "last-modified"
  >("metabase-bench-transforms-display");

  const sortFn = display === "last-modified" ? lastModifiedSorter : nameSorter;
  const transformsSorted = useMemo(
    () => [...transforms].sort(sortFn),
    [sortFn, transforms],
  );

  const treeData = useMemo((): ITreeNodeItem[] => {
    if (!databaseData || !transformsSorted || display !== "tree") {
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
        name: transform.target.name,
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
  }, [databaseData, display, transformsSorted]);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ItemsListSection
      sectionTitle={t`Transforms`}
      testId="transform-list-page"
      onCollapse={onCollapse}
      addButton={<CreateTransformMenu />}
      settings={
        <ItemsListSettings
          values={{ display }}
          settings={[
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
                {
                  label: t`Last modified`,
                  value: "last-modified",
                },
              ],
            },
          ]}
          onSettingChange={(updates) =>
            updates.display && setDisplay(updates.display)
          }
        />
      }
      listItems={
        transforms.length === 0 ? (
          <ListEmptyState
            label={
              hasFilterParams(params)
                ? t`No transforms found`
                : t`No transforms yet`
            }
          />
        ) : display === "tree" ? (
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
            <TransformsFlatList
              transforms={transformsSorted}
              tags={tags}
              selectedId={selectedId}
            />
          </Box>
        )
      }
    />
  );
}

interface TransformsFlatListProps {
  transforms: Transform[];
  tags: TransformTag[];
  selectedId?: Transform["id"];
}

function TransformsFlatList({
  transforms,
  tags,
  selectedId,
}: TransformsFlatListProps) {
  const tagById = useMemo(() => getTagById(tags), [tags]);

  return transforms.map((transform) => {
    const tagNames = getTagList(transform.tag_ids ?? [], tagById).map(
      (tag) => tag.name,
    );

    return (
      <BenchFlatListItem
        key={transform.id}
        icon="transform"
        href={getTransformUrl(transform.id)}
        label={transform.name}
        subtitle={transform.target.name}
        isActive={transform.id === selectedId}
        tags={tagNames}
      />
    );
  });
}
