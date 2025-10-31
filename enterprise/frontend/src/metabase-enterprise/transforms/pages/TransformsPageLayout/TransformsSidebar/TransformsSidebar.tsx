import { useDebouncedValue } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useLocalStorage } from "react-use";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { VirtualizedTree } from "metabase/common/components/tree/VirtualizedTree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useListTransformsQuery } from "metabase-enterprise/api";

import { ListEmptyState } from "../ListEmptyState";
import { SidebarContainer } from "../SidebarContainer";
import { SidebarSearch } from "../SidebarSearch";
import {
  SidebarSortControl,
  type SortOption,
  TRANSFORM_SORT_OPTIONS,
} from "../SidebarSortControl";
import { TransformsInnerNav } from "../TransformsInnerNav";
import { SidebarList } from "../TransformsSidebarLayout/SidebarList";
import { TransformListItem } from "../TransformsSidebarLayout/SidebarListItem/TransformListItem";
import { lastModifiedSorter, nameSorter } from "../utils";

import { TransformsTreeNode } from "./TransformsTreeNode";
import { buildTreeData } from "./utils";

interface TransformsSidebarProps {
  selectedTransformId?: number;
}

export const TransformsSidebar = ({
  selectedTransformId,
}: TransformsSidebarProps) => {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const [sortType = "tree", setSortType] = useLocalStorage<SortOption>(
    "metabase-transforms-display",
  );

  const { data: transforms, error, isLoading } = useListTransformsQuery({});
  const { data: databaseData } = useListDatabasesQuery();

  const filteredTransforms = useMemo(() => {
    if (!transforms) {
      return [];
    }

    if (!debouncedSearchQuery) {
      return transforms;
    }

    const query = debouncedSearchQuery.toLowerCase();
    return transforms.filter(
      (transform) =>
        transform.name.toLowerCase().includes(query) ||
        transform.target.name.toLowerCase().includes(query),
    );
  }, [transforms, debouncedSearchQuery]);

  const sortFn = sortType === "last-modified" ? lastModifiedSorter : nameSorter;

  const transformsSorted = useMemo(
    () => [...filteredTransforms].sort(sortFn),
    [filteredTransforms, sortFn],
  );

  const treeData = useMemo(
    () =>
      databaseData && sortType === "tree"
        ? buildTreeData(transformsSorted, databaseData.data)
        : [],
    [databaseData, transformsSorted, sortType],
  );

  const getTreeItemEstimateSize = useCallback((item: ITreeNodeItem) => {
    return item.icon === "table2" ? 52 : 33;
  }, []);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <SidebarContainer>
      <TransformsInnerNav />
      <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      <SidebarSortControl
        value={sortType}
        onChange={setSortType}
        options={TRANSFORM_SORT_OPTIONS}
      />
      {transformsSorted.length === 0 ? (
        <ListEmptyState
          label={
            debouncedSearchQuery ? t`No transforms found` : t`No transforms yet`
          }
        />
      ) : sortType === "tree" ? (
        <VirtualizedTree
          initiallyExpanded
          data={treeData}
          selectedId={selectedTransformId}
          onSelect={(node) => {
            if (typeof node.id === "number") {
              dispatch(push(Urls.transform(node.id)));
            }
          }}
          TreeNode={TransformsTreeNode}
          estimateSize={getTreeItemEstimateSize}
          p={0}
        />
      ) : (
        <SidebarList>
          {transformsSorted.map((transform) => (
            <TransformListItem
              key={transform.id}
              transform={transform}
              selectedId={selectedTransformId}
            />
          ))}
        </SidebarList>
      )}
    </SidebarContainer>
  );
};
