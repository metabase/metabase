import { useDeferredValue, useEffect, useState } from "react";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { Box, Flex, Icon, Input, Stack } from "metabase/ui";

import { Results } from "./Results";
import S from "./TablePicker.module.css";
import type { TreePath } from "./types";
import { flatten, useExpandedState, useSearch, useTableLoader } from "./utils";

export function TablePicker({
  value,
  onChange,
}: {
  value: TreePath;
  onChange: (path: TreePath) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  return (
    <Stack mih={200}>
      <Box p="xl" pb={0}>
        <Input
          value={query}
          onChange={(evt) => setQuery(evt.target.value)}
          placeholder={t`Search tables, fields…`}
          leftSection={<Icon name="search" />}
        />
      </Box>

      {deferredQuery === "" ? (
        <Tree value={value} onChange={onChange} />
      ) : (
        <Search query={deferredQuery} path={value} onChange={onChange} />
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
  query,
  path,
  onChange,
}: {
  query: string;
  path: TreePath;
  onChange: (path: TreePath) => void;
}) {
  const debouncedQuery = useDebouncedValue(query, 300);
  const { tree, isLoading } = useSearch(debouncedQuery);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const items = flatten(tree);
  const isEmpty = !isLoading && items.length === 0;

  // search results need their own keypress handling logic
  // because we want to keep the focus on the search input
  useKeyPressEvent("ArrowDown", (evt) => {
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
    evt.preventDefault();
  });
  useKeyPressEvent("ArrowUp", (evt) => {
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
    evt.preventDefault();
  });

  useKeyPressEvent("Enter", (evt) => {
    const item = items[selectedIndex];
    if (item.value) {
      onChange?.(item.value);
      evt.preventDefault();
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
