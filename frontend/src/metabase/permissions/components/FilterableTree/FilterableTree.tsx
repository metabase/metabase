import { Fragment, useMemo, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Divider,
  Flex,
  Icon,
  Input,
  TextInput,
  type TextInputProps,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { IconName } from "metabase-types/api";

import { AdminTreeNode } from "./AdminTreeNode";
import { searchItems } from "./utils";

interface FilterableTreeProps {
  selectedId?: ITreeNodeItem["id"];
  placeholder: string;
  itemGroups: ITreeNodeItem[][];
  emptyState?: {
    text: string;
    icon: IconName;
  };
  onSelect: (item: ITreeNodeItem) => void;
}

export const FilterableTree = ({
  placeholder,
  itemGroups,
  selectedId,
  emptyState,
  onSelect,
}: FilterableTreeProps) => {
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);

  const filteredList = useMemo(() => {
    const trimmedFilter = debouncedFilter.trim().toLowerCase();

    if (trimmedFilter.length === 0) {
      return null;
    }

    return searchItems(itemGroups.flat(), trimmedFilter);
  }, [itemGroups, debouncedFilter]);

  const handleFilterChange: TextInputProps["onChange"] = (e) =>
    setFilter(e.target.value);

  return (
    <Flex className={CS.overflowHidden} direction="column">
      <TextInput
        py="md"
        px="xl"
        placeholder={placeholder}
        value={filter}
        leftSection={<Icon name="search" />}
        rightSectionPointerEvents="all"
        rightSection={
          filter.length > 0 ? (
            <Input.ClearButton
              c="text-secondary"
              onClick={() => setFilter("")}
            />
          ) : null
        }
        onChange={handleFilterChange}
      />
      <Box className={CS.overflowAuto}>
        {filteredList && (
          <Tree
            data={filteredList}
            selectedId={selectedId}
            onSelect={onSelect}
            TreeNode={AdminTreeNode}
            emptyState={
              <Box mt="6.25rem">
                <EmptyState
                  message={emptyState?.text ?? t`Nothing here`}
                  icon={emptyState?.icon ?? "folder"}
                />
              </Box>
            }
          />
        )}
        {!filteredList &&
          itemGroups.map((items, index) => {
            const isLastGroup = index === itemGroups.length - 1;
            return (
              <Fragment key={index}>
                <Tree
                  data={items}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  TreeNode={AdminTreeNode}
                />
                {!isLastGroup && <Divider my="lg" mx="xl" />}
              </Fragment>
            );
          })}
      </Box>
    </Flex>
  );
};
