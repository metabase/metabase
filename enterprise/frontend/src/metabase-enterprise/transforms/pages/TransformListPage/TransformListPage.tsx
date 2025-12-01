import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { VirtualizedTree } from "metabase/common/components/tree/VirtualizedTree";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { SidebarListItem } from "metabase-enterprise/transforms/pages/TransformSidebarLayout/SidebarListItem/SidebarListItem";
import { TransformListItem } from "metabase-enterprise/transforms/pages/TransformSidebarLayout/SidebarListItem/TransformListItem";
import { SHARED_LIB_IMPORT_PATH } from "metabase-enterprise/transforms-python/constants";

import { CreateTransformMenu } from "../TransformSidebarLayout/CreateTransformMenu";
import { SidebarList } from "../TransformSidebarLayout/SidebarList";
import { SidebarLoadingState } from "../TransformSidebarLayout/SidebarLoadingState";
import { SidebarSearchAndControls } from "../TransformSidebarLayout/SidebarSearchAndControls";
import { TRANSFORM_SORT_OPTIONS } from "../TransformSidebarLayout/SidebarSortControl";
import S from "../TransformSidebarLayout/TransformsSidebar/TransformsSidebar.module.css";
import { TransformsTreeNode } from "../TransformSidebarLayout/TransformsSidebar/TransformsTreeNode";
import { buildTreeData } from "../TransformSidebarLayout/TransformsSidebar/utils";
import {
  lastModifiedSorter,
  nameSorter,
} from "../TransformSidebarLayout/utils";

const DEFAULT_SORT_TYPE = "tree";

interface TransformsSidebarProps {
  selectedTransformId?: number;
}

export const TransformListPageSidebar = ({
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

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <>
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
    </>
  );
};
