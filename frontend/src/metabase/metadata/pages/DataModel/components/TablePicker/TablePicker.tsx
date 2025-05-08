import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeferredValue, useRef, useState } from "react";

import { Box, Stack } from "metabase/ui";
import type { DatabaseId, SchemaId } from "metabase-types/api";

import { ITEM_MIN_HEIGHT, ItemRow } from "./Item";
import { SearchInput, SearchResults } from "./Search";
import S from "./TablePicker.module.css";
import {
  type TreeNode,
  flatten,
  useExpandedState,
  useTableLoader,
} from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);

  const { isExpanded, toggle } = useExpandedState(props);
  const { tree } = useTableLoader(props);

  return (
    <Stack className={S.tablePicker}>
      <Box px="xl">
        <SearchInput value={searchValue} onChange={setSearchValue} />
      </Box>

      {deferredSearchValue === "" ? (
        <Results tree={tree} toggle={toggle} isExpanded={isExpanded} />
      ) : (
        <Box className={S.tablePickerItemWrapper} px="xl" pb="lg">
          <SearchResults searchValue={searchValue} />
        </Box>
      )}
    </Stack>
  );
}

function Results({
  tree,
  toggle,
  isExpanded,
}: {
  tree: TreeNode;
  toggle: (key: string) => void;
  isExpanded: (key: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const items = flatten(tree, isExpanded);

  const virtual = useVirtualizer({
    estimateSize: () => ITEM_MIN_HEIGHT,
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: 5,
  });

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.tablePickerItemWrapper}>
      <Box
        style={{
          height: virtual.getTotalSize(),
        }}
      >
        {virtual.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <ItemRow
              {...item}
              key={item.key}
              ref={virtual.measureElement}
              onClick={() => {
                toggle(item.key);
                virtual.measure();
              }}
              style={{
                position: "absolute",
                top: virtualItem.start,
              }}
              isExpanded={isExpanded(item.key)}
            />
          );
        })}
      </Box>
    </Box>
  );
}
