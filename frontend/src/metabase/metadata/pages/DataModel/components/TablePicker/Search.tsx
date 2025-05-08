import { skipToken, useSearchQuery } from "metabase/api";
import type {
  DatabaseId,
  SchemaId,
  SearchResponse,
  TableId,
} from "metabase-types/api";

import { type Item, item } from "./utils";

export function useSearch(query: string) {
  const { data, isLoading } = useSearchQuery(
    query === ""
      ? skipToken
      : {
          q: query,
          models: ["table"],
        },
  );

  const items = data ? flatten(data) : [];

  return {
    isLoading,
    data: items,
  };
}

function byLabel(a: { label: string }, b: { label: string }) {
  return a.label.localeCompare(b.label);
}

type Tree = {
  [databaseName: string]: {
    id: DatabaseId;
    label: string;
    schemas: {
      [schemaName: string]: {
        id: SchemaId;
        label: string;
        tables: {
          id: TableId;
          label: string;
        }[];
      };
    };
  };
};

function flatten(data: SearchResponse): Item[] {
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
      label: result.database_name,
      schemas: {},
    };
    tree[result.database_id].schemas[result.table_schema] ??= {
      id: result.table_schema,
      label: result.table_schema,
      tables: [],
    };
    tree[result.database_id].schemas[result.table_schema].tables.push({
      id: result.id,
      label: result.name,
    });
  });

  return Object.values(tree)
    .sort(byLabel)
    .flatMap((database) => [
      item({
        type: "database",
        label: database.label,
        value: {
          databaseId: database.id,
        },
      }),
      ...Object.values(database.schemas)
        .sort(byLabel)
        .flatMap((schema) => [
          item({
            type: "schema",
            label: schema.label,
            value: {
              databaseId: database.id,
              schemaId: schema.id,
            },
          }),
          ...Object.values(schema.tables)
            .sort(byLabel)
            .flatMap((table) => [
              item({
                type: "table",
                label: table.label,
                value: {
                  databaseId: database.id,
                  schemaId: schema.id,
                  tableId: table.id,
                },
              }),
            ]),
        ]),
    ]);
}
