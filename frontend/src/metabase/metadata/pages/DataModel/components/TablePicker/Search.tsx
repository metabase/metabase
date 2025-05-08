import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useSearchQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { Box, Icon, Input } from "metabase/ui";
import type { DatabaseId, SchemaId, SearchResponse } from "metabase-types/api";

import { ItemRow } from "./Item";
import { type Item, toKey } from "./utils";

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

  const items = data ? flatten(data) : [];
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

  return items?.map((item) => (
    <ItemRow
      type={item.type}
      label={item.label}
      key={toKey(item.value)}
      value={item.value}
      isExpanded
    />
  ));
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

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

function flatten(data: SearchResponse): Omit<Item, "key">[] {
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

  return Object.values(tree)
    .sort(byName)
    .flatMap((database) => [
      {
        type: "database" as const,
        label: database.name,
        value: {
          databaseId: database.id,
        },
      },
      ...Object.values(database.schemas)
        .sort(byName)
        .flatMap((schema) => [
          {
            type: "schema" as const,
            label: schema.name,
            value: {
              databaseId: database.id,
              schemaId: schema.id,
            },
          },
          ...Object.values(schema.tables)
            .sort(byName)
            .flatMap((table) => [
              {
                type: "table" as const,
                label: table.name,
                value: {
                  databaseId: database.id,
                  schemaId: schema.id,
                  tableId: table.id,
                },
              },
            ]),
        ]),
    ]);
}
