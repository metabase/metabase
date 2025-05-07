import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeferredValue, useRef, useState } from "react";

import { Box, Stack } from "metabase/ui";
import type { DatabaseId, SchemaId } from "metabase-types/api";

import { ItemRow } from "./Item";
import { SearchInput, SearchResults } from "./Search";
import S from "./TablePicker.module.css";
import { type Item, flatten, useExpandedState, useTableLoader } from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);

  const { isExpanded, toggle } = useExpandedState(props);
  const { tree } = useTableLoader(props);

  const flat = flatten(tree, isExpanded);

  return (
    <Stack className={S.tablePicker}>
      <Box px="xl">
        <SearchInput value={searchValue} onChange={setSearchValue} />
      </Box>

      {deferredSearchValue === "" ? (
        <Results items={flat} toggle={toggle} isExpanded={isExpanded} />
      ) : (
        <Box className={S.tablePickerContent} px="xl" pb="lg">
          <SearchResults searchValue={searchValue} />
        </Box>
      )}
    </Stack>
  );
}

function Results({
  items,
  toggle,
  isExpanded,
}: {
  items: Item[];
  toggle: (key: string) => void;
  isExpanded: (key: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const virtual = useVirtualizer({
    estimateSize: () => 36,
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: 5,
  });

  return (
    <Box
      ref={ref}
      style={{
        position: "relative",
        overflow: "auto",
        height: "100%",
      }}
      px="xl"
      pb="lg"
    >
      <Box
        style={{
          height: virtual.getTotalSize(),
        }}
      >
        {virtual.getVirtualItems().map((virtualItem) => {
          const { type, ...item } = items[virtualItem.index];
          if (type === "root") {
            return null;
          }
          return (
            <ItemRow
              {...item}
              key={item.key}
              type={type}
              onClick={() => {
                toggle(item.key);
                virtual.measure();
              }}
              style={{
                position: "absolute",
                top: virtualItem.start,
                minHeight: virtualItem.size,
              }}
              isExpanded={isExpanded(item.key)}
            />
          );
        })}
      </Box>
    </Box>
  );
}
