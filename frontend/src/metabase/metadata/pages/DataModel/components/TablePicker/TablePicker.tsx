import cx from "classnames";
import { useDeferredValue, useState } from "react";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon, Stack } from "metabase/ui";
import type { DatabaseId, SchemaId } from "metabase-types/api";

import { getUrl } from "../../utils";

import { SearchInput, SearchResults } from "./Search";
import S from "./TablePicker.module.css";
import { type Item, flatten, useExpandedState, useTableLoader } from "./load";
import { getIconForType, hasChildren } from "./utils";

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

      <Box className={S.tablePickerContent} px="xl" pb="lg">
        {deferredSearchValue === "" ? (
          <Results items={flat} toggle={toggle} isExpanded={isExpanded} />
        ) : (
          <SearchResults searchValue={searchValue} />
        )}
      </Box>
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
  return items.map((item) => {
    if (item.type === "root") {
      return null;
    }
    return (
      <Box className={cx(S.item, S[item.type])} key={item.key}>
        <Link
          to={getUrl({
            databaseId: undefined,
            fieldId: undefined,
            schemaId: undefined,
            tableId: undefined,
            ...item.value,
          })}
          onClick={() => toggle(item.key)}
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
  });
}
