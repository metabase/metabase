import { useState } from "react";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";

import { useSearch } from "../hooks";
import type { TreePath } from "../types";
import { flatten } from "../utils";

import { EmptyState } from "./EmptyState";
import { Results } from "./Results";

interface Props {
  query: string;
  path: TreePath;
  onChange: (path: TreePath) => void;
}

export function Search({ query, path, onChange }: Props) {
  const debouncedQuery = useDebouncedValue(query, 300);
  const { tree, isLoading } = useSearch(debouncedQuery);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const items = flatten(tree);
  const isEmpty = !isLoading && items.length === 0;

  // search results need their own keypress handling logic
  // because we want to keep the focus on the search input
  useKeyPressEvent("ArrowDown", (event) => {
    setSelectedIndex((selectedIndex) => {
      const nextTableIndex = items.findIndex(
        (item, index) => item.type === "table" && index > selectedIndex,
      );
      if (nextTableIndex >= 0) {
        return nextTableIndex;
      }
      const firstTableIndex = items.findIndex((item) => item.type === "table");
      return firstTableIndex;
    });
    event.preventDefault();
  });

  useKeyPressEvent("ArrowUp", (event) => {
    setSelectedIndex((selectedIndex) => {
      const previousTableIndex = items.findLastIndex(
        (item, index) => item.type === "table" && index < selectedIndex,
      );
      if (previousTableIndex >= 0) {
        return previousTableIndex;
      }
      const lastTableIndex = items.findLastIndex(
        (item) => item.type === "table",
      );
      return lastTableIndex;
    });
    event.preventDefault();
  });

  useKeyPressEvent("Enter", (event) => {
    const item = items[selectedIndex];
    if (item?.value) {
      onChange?.(item.value);
      event.preventDefault();
    }
  });

  if (isEmpty) {
    return <EmptyState title={t`No results.`} />;
  }

  return (
    <Results
      items={items}
      path={path}
      onItemClick={onChange}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={setSelectedIndex}
    />
  );
}
