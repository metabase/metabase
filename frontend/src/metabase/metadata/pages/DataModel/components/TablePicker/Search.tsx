import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useSearchQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { Box, Icon, Input } from "metabase/ui";
import type { DatabaseId, SchemaId, SearchResponse } from "metabase-types/api";

import { Node } from "./Node";

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(evt) => onChange(evt.target.value)}
      placeholder={t`Search tables, fields…`}
      leftSection={<Icon name="search" />}
    />
  );
}

export function SearchResults({ searchValue }: { searchValue: string }) {
  const { data, isLoading } = useSearchQuery({
    q: searchValue,
    models: ["table"],
  });

  type Tree = {
    [databaseName: string]: {
      id: DatabaseId;
      name: string;
      schemas: {
        [schemaName: string]: {
          id: SchemaId;
          name: string;
          tables: SearchResponse["data"][number][];
        };
      };
    };
  };

  const tree: Tree = {};
  data?.data.forEach((result) => {
    if (
      result.model !== "table" ||
      !result.database_name ||
      !result.table_schema
    ) {
      return;
    }

    tree[result.database_id] ??= {
      id: result.database_id,
      name: result.database_name,
      schemas: {},
    };
    tree[result.database_id].schemas[result.table_schema] ??= {
      id: result.table_schema,
      name: result.table_schema,
      tables: [],
    };
    tree[result.database_id].schemas[result.table_schema].tables.push(result);
  });

  const isEmpty = !isLoading && Object.keys(tree).length === 0;

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

  return (
    <div>
      {Object.keys(tree)
        .sort()
        .map((id) => tree[id])
        .map((database) => (
          <Node key={database.id} type="database" name={database.name} expanded>
            {Object.keys(database.schemas)
              .sort()
              .map((schemaName) => database.schemas[schemaName])
              .map((schema) => (
                <Node key={schema.id} type="schema" name={schema.name} expanded>
                  {schema.tables.sort(byName).map((result) => (
                    <Node key={result.id} type="table" name={result.name} />
                  ))}
                </Node>
              ))}
          </Node>
        ))}
    </div>
  );
}

function byName(
  a: SearchResponse["data"][number],
  b: SearchResponse["data"][number],
) {
  return a.name.localeCompare(b.name);
}
