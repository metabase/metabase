import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useDeferredValue, useRef, useState } from "react";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon, Stack } from "metabase/ui";
import type { DatabaseId, SchemaId } from "metabase-types/api";

import { getUrl } from "../../utils";

import { SearchInput, SearchResults } from "./Search";
import S from "./TablePicker.module.css";
import {
  type Item,
  flatten,
  getIconForType,
  hasChildren,
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
          const item = items[virtualItem.index];
          if (item.type === "root") {
            return null;
          }
          return (
            <Box
              className={cx(S.item, S[item.type])}
              key={item.key}
              style={{
                position: "absolute",
                top: virtualItem.start,
                minHeight: virtualItem.size,
              }}
            >
              <Link
                to={getUrl({
                  databaseId: undefined,
                  fieldId: undefined,
                  schemaId: undefined,
                  tableId: undefined,
                  ...item.value,
                })}
                onClick={() => {
                  toggle(item.key);
                  virtual.measure();
                }}
              >
                <Flex align="center" gap="sm" direction="row" mb="xs">
                  {hasChildren(item.type) ? (
                    <Icon
                      name="chevronright"
                      size={10}
                      color="var(--mb-color-text-light)"
                      className={cx(S.chevron, {
                        [S.expanded]: isExpanded(item.key),
                      })}
                    />
                  ) : null}
                  <Icon name={getIconForType(item.type)} />
                  {item.label}
                </Flex>
              </Link>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
