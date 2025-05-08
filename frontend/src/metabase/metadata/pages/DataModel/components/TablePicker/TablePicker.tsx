import { useDeferredValue, useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import EmptyState from "metabase/components/EmptyState";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { useDispatch } from "metabase/lib/redux";
import { Box, Icon, Input, Stack } from "metabase/ui";

import { Results } from "./Results";
import type { TreePath } from "./types";
import {
  flatten,
  getUrl,
  useExpandedState,
  useSearch,
  useTableLoader,
} from "./utils";

export function TablePicker(props: TreePath) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  return (
    <Stack mih={200} h="100%">
      <Box px="xl">
        <Input
          value={query}
          onChange={(evt) => setQuery(evt.target.value)}
          placeholder={t`Search tables, fields…`}
          leftSection={<Icon name="search" />}
        />
      </Box>

      {deferredQuery === "" ? (
        <Tree {...props} />
      ) : (
        <Search query={deferredQuery} path={props} />
      )}
    </Stack>
  );
}

function Tree(props: TreePath) {
  const { databaseId, schemaId } = props;
  const { isExpanded, toggle } = useExpandedState(props);
  const { tree } = useTableLoader(props);

  const items = flatten(tree, { isExpanded, addLoadingNodes: true });
  const dispatch = useDispatch();

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
        dispatch(push(getUrl(schema.value)));
      }
    }
  }, [databaseId, schemaId, tree, dispatch, toggle, isExpanded]);

  return <Results items={items} toggle={toggle} path={props} />;
}

function Search({ query, path }: { query: string; path: TreePath }) {
  const debouncedQuery = useDebouncedValue(query, 500);
  const { tree, isLoading } = useSearch(debouncedQuery);

  const items = flatten(tree);
  const isEmpty = !isLoading && items.length === 0;

  if (isEmpty) {
    return (
      <Box p="md">
        <EmptyState
          title={t`No results`}
          illustrationElement={<img src={NoResults} />}
        />
      </Box>
    );
  }

  return <Results items={items} path={path} />;
}
