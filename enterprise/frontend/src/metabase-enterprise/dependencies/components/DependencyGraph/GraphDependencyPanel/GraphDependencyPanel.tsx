import { useDebouncedValue } from "@mantine/hooks";
import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import { Box, Card, Group, Skeleton, Stack } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import type {
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
} from "metabase-types/api";

import { DEPENDENTS_SEARCH_THRESHOLD } from "../../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../types";
import { getDependentsCount, getSearchQuery } from "../../../utils";

import S from "./GraphDependencyPanel.module.css";
import { PanelBody } from "./PanelBody";
import { PanelHeader } from "./PanelHeader";
import {
  getAvailableSortColumns,
  getDefaultFilterOptions,
  getDefaultSortOptions,
  getListRequest,
} from "./utils";

type GraphDependencyPanelProps = {
  node: DependencyNode;
  groupType: DependencyGroupType;
  getGraphUrl: (entry: DependencyEntry) => string;
  onClose: () => void;
};

export function GraphDependencyPanel({
  node,
  groupType,
  getGraphUrl,
  onClose,
}: GraphDependencyPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [searchQuery] = useDebouncedValue(
    getSearchQuery(searchText),
    SEARCH_DEBOUNCE_DURATION,
  );
  const [filterOptions, setFilterOptions] = useState<DependencyFilterOptions>(
    getDefaultFilterOptions(),
  );
  const [sortOptions, setSortOptions] = useState<DependencySortOptions>(
    getDefaultSortOptions(groupType),
  );
  const {
    data: nodes = [],
    isLoading,
    error,
  } = useListNodeDependentsQuery(
    getListRequest(node, groupType, searchQuery, filterOptions, sortOptions),
  );
  const dependentsCount = getDependentsCount(node);

  useLayoutEffect(() => {
    const availableSortColumns = getAvailableSortColumns(groupType);
    if (!availableSortColumns.includes(sortOptions.column)) {
      setSortOptions(getDefaultSortOptions(groupType));
    }
  }, [groupType, sortOptions]);

  return (
    <Card className={S.root} withBorder data-testid="graph-dependency-panel">
      <PanelHeader
        node={node}
        groupType={groupType}
        searchText={searchText}
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        hasSearch={dependentsCount >= DEPENDENTS_SEARCH_THRESHOLD}
        onSearchTextChange={setSearchText}
        onFilterOptionsChange={setFilterOptions}
        onSortOptionsChange={setSortOptions}
        onClose={onClose}
      />
      {isLoading || error != null ? (
        <DelayedLoadingAndErrorWrapper
          loading={isLoading}
          error={error}
          loader={<PanelBodySkeleton />}
        />
      ) : nodes.length === 0 ? (
        <Box p="xl" c="text-secondary" ta="center">
          {t`Didn't find any results`}
        </Box>
      ) : (
        <PanelBody nodes={nodes} getGraphUrl={getGraphUrl} />
      )}
    </Card>
  );
}

const SKELETON_ITEM_COUNT = 4;

function PanelBodySkeleton() {
  return (
    <Stack gap={0}>
      {Array.from({ length: SKELETON_ITEM_COUNT }, (_, index) => (
        <Stack key={index} className={S.skeletonItem} p="xl" gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" flex={1}>
              <Skeleton h={16} w={16} radius="xs" flex="none" />
              <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
            </Group>
            <Skeleton h={10} w={56} radius="xs" />
          </Group>
          <Skeleton
            h={10}
            w={`calc(${getSkeletonLineWidth(index + 3)} / 2)`}
            ml="1.5rem"
            radius="xs"
          />
        </Stack>
      ))}
    </Stack>
  );
}
