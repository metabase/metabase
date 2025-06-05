import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { Box, Flex, Icon, Input, Stack, rem } from "metabase/ui";

import { Results } from "./Results";
import S from "./TablePicker.module.css";
import type { FlatItem, TreePath } from "./types";
import { flatten, useExpandedState, useSearch, useTableLoader } from "./utils";

export function TablePicker({
  value,
  onChange,
}: {
  value: TreePath;
  onChange: (path: TreePath) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const deferredQuery = useDeferredValue(query);
  const debouncedQuery = useDebouncedValue(deferredQuery, 300);
  const { isLoading, tree } = useSearch(debouncedQuery);
  const searchItems = useMemo(() => flatten(tree), [tree]);

  // search results need their own keypress handling logic
  // because we want to keep the focus on the search input
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (deferredQuery === "") {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setSelectedIndex((selectedIndex) => {
        const nextTableIndex = searchItems.findIndex(
          (item, index) => item.type === "table" && index > selectedIndex,
        );
        if (nextTableIndex >= 0) {
          return nextTableIndex;
        }
        const firstTableIndex = searchItems.findIndex(
          (item) => item.type === "table",
        );
        return firstTableIndex;
      });
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setSelectedIndex((selectedIndex) => {
        const previousTableIndex = searchItems.findLastIndex(
          (item, index) => item.type === "table" && index < selectedIndex,
        );
        if (previousTableIndex >= 0) {
          return previousTableIndex;
        }
        const lastTableIndex = searchItems.findLastIndex(
          (item) => item.type === "table",
        );
        return lastTableIndex;
      });
    }

    if (event.key === "Enter") {
      const item = searchItems[selectedIndex];

      if (item?.value) {
        event.preventDefault();

        onChange(item.value);
      }
    }
  };

  return (
    <Stack mih={rem(200)}>
      <Box p="xl" pb={0}>
        <Input
          leftSection={<Icon name="search" />}
          placeholder={t`Search tables`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </Box>

      {deferredQuery === "" ? (
        <Tree value={value} onChange={onChange} />
      ) : (
        <Search
          isLoading={isLoading}
          items={searchItems}
          path={value}
          selectedIndex={selectedIndex}
          onChange={onChange}
          onSelectedIndexChange={setSelectedIndex}
        />
      )}
    </Stack>
  );
}

function Tree({
  value,
  onChange,
}: {
  value: TreePath;
  onChange: (path: TreePath) => void;
}) {
  const { databaseId, schemaId } = value;
  const { isExpanded, toggle } = useExpandedState(value);
  const { tree } = useTableLoader(value);

  const items = flatten(tree, {
    isExpanded,
    addLoadingNodes: true,
    canFlattenSingleSchema: true,
  });
  const isEmpty = items.length === 0;

  useEffect(() => {
    // When we detect a database with just one schema, we automatically
    // select and expand that schema.
    const database = tree.children.find(
      (node) =>
        node.type === "database" && node.value.databaseId === databaseId,
    );
    if (
      databaseId &&
      isExpanded({ databaseId }) &&
      database?.children.length === 1
    ) {
      const schema = database.children[0];
      if (schema.type === "schema" && schemaId !== schema.value.schemaId) {
        toggle(schema.key, true);
        onChange(schema.value);
      }
    }
  }, [databaseId, schemaId, tree, toggle, isExpanded, onChange]);

  if (isEmpty) {
    return <EmptyState title={t`No data to show.`} />;
  }

  return (
    <Results
      items={items}
      toggle={toggle}
      path={value}
      onItemClick={onChange}
    />
  );
}

function Search({
  isLoading,
  items,
  path,
  selectedIndex,
  onChange,
  onSelectedIndexChange,
}: {
  isLoading: boolean;
  items: FlatItem[];
  path: TreePath;
  selectedIndex: number;
  onChange: (path: TreePath) => void;
  onSelectedIndexChange: (index: number) => void;
}) {
  const isEmpty = !isLoading && items.length === 0;

  if (isEmpty) {
    return <EmptyState title={t`No results.`} />;
  }

  return (
    <Results
      items={items}
      path={path}
      onItemClick={onChange}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={onSelectedIndexChange}
    />
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <Stack py="xl" align="center" className={S.emptyState} gap="md">
      <Flex className={S.empyIcon} p="lg" align="center" justify="center">
        <Icon name="table2" />
      </Flex>
      <Box>{title}</Box>
    </Stack>
  );
}
