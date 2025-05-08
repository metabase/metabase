import { useDeferredValue, useState } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import EmptyState from "metabase/components/EmptyState";
import { Box, Icon, Input, Stack } from "metabase/ui";
import type { DatabaseId, SchemaId } from "metabase-types/api";

import { Results } from "./Item";
import { useSearch } from "./Search";
import { flatten, useExpandedState, useTableLoader } from "./utils";

type TablePickerProps = {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
};

export function TablePicker(props: TablePickerProps) {
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
        <Search query={deferredQuery} />
      )}
    </Stack>
  );
}

function Tree(props: TablePickerProps) {
  const { isExpanded, toggle } = useExpandedState(props);
  const { tree } = useTableLoader(props);

  const items = flatten(tree, isExpanded);
  return <Results items={items} toggle={toggle} isExpanded={isExpanded} />;
}

function Search({ query }: { query: string }) {
  const { data, isLoading } = useSearch(query);
  const isEmpty = !isLoading && data.length === 0;

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
  return <Results items={data} isExpanded={() => true} />;
}
