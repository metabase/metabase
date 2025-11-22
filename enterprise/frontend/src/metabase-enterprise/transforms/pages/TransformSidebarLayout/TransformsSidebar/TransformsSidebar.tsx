import { useDebouncedValue } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { VirtualizedTree } from "metabase/common/components/tree/VirtualizedTree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { SidebarListItem } from "metabase-enterprise/transforms/pages/TransformSidebarLayout/SidebarListItem/SidebarListItem";
import { TransformListItem } from "metabase-enterprise/transforms/pages/TransformSidebarLayout/SidebarListItem/TransformListItem";
import { SHARED_LIB_IMPORT_PATH } from "metabase-enterprise/transforms-python/constants";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { CreateTransformMenu } from "../CreateTransformMenu";
import { SidebarContainer } from "../SidebarContainer";
import { SidebarList } from "../SidebarList";
import { SidebarLoadingState } from "../SidebarLoadingState";
import { SidebarSearchAndControls } from "../SidebarSearchAndControls";
import { TRANSFORM_SORT_OPTIONS } from "../SidebarSortControl";
import { lastModifiedSorter, nameSorter } from "../utils";

import S from "./TransformsSidebar.module.css";
import { TransformsTreeNode } from "./TransformsTreeNode";
import { buildTreeData } from "./utils";

const DEFAULT_SORT_TYPE = "tree";

interface TransformsSidebarProps {
  selectedTransformId?: number;
}

export const TransformsSidebar = ({
  selectedTransformId,
}: TransformsSidebarProps) => {
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const { value: sortType, setValue: setSortType } = useUserKeyValue({
    namespace: "transforms",
    key: "transforms-sort-type",
    defaultValue: DEFAULT_SORT_TYPE,
  });

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

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <SidebarContainer data-testid="transforms-sidebar">
      <Flex direction="column" gap="md" p="md">
        <SidebarSearchAndControls
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          sortValue={sortType}
          sortOptions={TRANSFORM_SORT_OPTIONS}
          onSortChange={setSortType}
          addButton={<CreateTransformMenu />}
          sortLabel={t`Sort transforms`}
        />
      </Flex>
      <Flex direction="column" flex={1} mih={0}>
        {isLoading ? (
          <SidebarLoadingState />
        ) : transformsSorted.length === 0 ? (
          <ListEmptyState
            label={
              debouncedSearchQuery
                ? t`No transforms found`
                : t`No transforms yet`
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
      </Flex>
      {isAdmin && PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
        <Box p="sm" className={S.footer}>
          <SidebarListItem
            icon="code_block"
            href={Urls.transformPythonLibrary({ path: SHARED_LIB_IMPORT_PATH })}
            label={t`Python library`}
            subtitle={t`Shared helper functions`}
          />
        </Box>
      )}
    </SidebarContainer>
  );
};
