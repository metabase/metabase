import { Fragment, useMemo, useState } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { Tree } from "metabase/components/tree";
import type { ITreeNodeItem } from "metabase/components/tree/types";
import type { InputProps } from "metabase/core/components/Input";
import Input from "metabase/core/components/Input";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import type { IconName } from "metabase/ui";

import {
  EmptyStateContainer,
  FilterableTreeContainer,
  FilterableTreeRoot,
  FilterInputContainer,
  ItemGroupsDivider,
  AdminTreeNode,
} from "./FilterableTree.styled";
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

  const handleFilterChange: InputProps["onChange"] = e =>
    setFilter(e.target.value);

  return (
    <FilterableTreeRoot>
      <FilterInputContainer>
        <Input
          fullWidth
          placeholder={placeholder}
          value={filter}
          leftIcon="search"
          colorScheme="filter"
          onChange={handleFilterChange}
          onResetClick={() => setFilter("")}
        />
      </FilterInputContainer>
      <FilterableTreeContainer>
        {filteredList && (
          <Tree
            data={filteredList}
            selectedId={selectedId}
            onSelect={onSelect}
            TreeNode={AdminTreeNode}
            emptyState={
              <EmptyStateContainer>
                <EmptyState
                  message={emptyState?.text ?? t`Nothing here`}
                  icon={emptyState?.icon ?? "folder"}
                />
              </EmptyStateContainer>
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
                {!isLastGroup && <ItemGroupsDivider />}
              </Fragment>
            );
          })}
      </FilterableTreeContainer>
    </FilterableTreeRoot>
  );
};
