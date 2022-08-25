import { t } from "ttag";
import EmptyState from "metabase/components/EmptyState";
import Icon from "metabase/components/Icon";
import TextInput from "metabase/components/TextInput";
import { Tree } from "metabase/components/tree";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import React, { useMemo, useState } from "react";
import {
  EmptyStateContainer,
  FilterableTreeContainer,
  FilterableTreeRoot,
  FilterInputContainer,
  ItemGroupsDivider,
  AdminTreeNode,
} from "./FilterableTree.styled";
import { searchItems } from "./utils";
import { ITreeNodeItem } from "metabase/components/tree/types";

interface FilterableTreeProps {
  selectedId?: ITreeNodeItem["id"];
  placeholder: string;
  itemGroups: ITreeNodeItem[][];
  emptyState?: {
    text: string;
    icon: string;
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

  return (
    <FilterableTreeRoot>
      <FilterInputContainer>
        <TextInput
          hasClearButton
          colorScheme="admin"
          placeholder={placeholder}
          onChange={setFilter}
          value={filter}
          padding="sm"
          icon={<Icon name="search" size={16} />}
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
                {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                {/* @ts-ignore */}
                <EmptyState
                  message={emptyState?.text ?? t`Nothing here`}
                  icon={emptyState?.icon ?? "all"}
                />
              </EmptyStateContainer>
            }
          />
        )}
        {!filteredList &&
          itemGroups.map((items, index) => {
            const isLastGroup = index === itemGroups.length - 1;
            return (
              <React.Fragment key={index}>
                <Tree
                  data={items}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  TreeNode={AdminTreeNode}
                />
                {!isLastGroup && <ItemGroupsDivider />}
              </React.Fragment>
            );
          })}
      </FilterableTreeContainer>
    </FilterableTreeRoot>
  );
};
