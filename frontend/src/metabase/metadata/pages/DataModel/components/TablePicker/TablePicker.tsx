import { useDeferredValue, useEffect, useState } from "react";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Box, Flex, Icon, Input, Stack, rem } from "metabase/ui";

import { Results } from "./Results";
import S from "./TablePicker.module.css";
import type { ChangeOptions, TreePath } from "./types";
import { flatten, useExpandedState, useSearch, useTableLoader } from "./utils";

export function TablePicker({
  path,
  onChange,
}: {
  path: TreePath;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  return (
    <Stack data-testid="table-picker" mih={rem(200)}>
      <Box p="xl" pb={0}>
        <Input
          leftSection={<Icon name="search" />}
          placeholder={t`Search tables`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Box>

      {deferredQuery === "" ? (
        <Tree path={path} onChange={onChange} />
      ) : (
        <Search query={deferredQuery} path={path} onChange={onChange} />
      )}
    </Stack>
  );
}

function Tree({
  path,
  onChange,
}: {
  path: TreePath;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}) {
  const { databaseId, schemaName } = path;
  const { isExpanded, toggle } = useExpandedState(path);
  const { tree, reload } = useTableLoader(path);

  const items = flatten(tree, {
    isExpanded,
    addLoadingNodes: true,
    canFlattenSingleSchema: true,
  });
  const isEmpty = items.length === 0;

  useEffect(() => {
    // When we detect only one database, we automatically select and expand it.
    const databases = tree.children.filter((node) => node.type === "database");

    if (databases.length !== 1) {
      return;
    }

    const [database] = databases;

    if (
      !isExpanded({ databaseId: database.value.databaseId }) &&
      databaseId == null
    ) {
      toggle(database.key, true);
      onChange(database.value, { isAutomatic: true });
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

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
      database?.children.length === 1 &&
      schemaName == null
    ) {
      const schema = database.children[0];
      if (schema.type === "schema") {
        toggle(schema.key, true);
        onChange(schema.value, { isAutomatic: true });
      }
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

  if (isEmpty) {
    return <EmptyState title={t`No data to show`} />;
  }

  return (
    <Results
      items={items}
      path={path}
      reload={reload}
      toggle={toggle}
      withMassToggle
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
