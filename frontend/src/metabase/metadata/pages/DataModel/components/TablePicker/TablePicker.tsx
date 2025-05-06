import { useState } from "react";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import type {
  Database,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

import { getUrl } from "../../utils";

import { Node, renderLoading } from "./Node";
import { SearchInput, SearchResults } from "./Search";
import { useExpandedState, usePrefetch } from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const [searchValue, setSearchValue] = useState("");

  return (
    <>
      <SearchInput value={searchValue} onChange={setSearchValue} />
      {searchValue === "" ? (
        <RootNode {...props} />
      ) : (
        <SearchResults searchValue={searchValue} />
      )}
    </>
  );
}

function RootNode({
  databaseId,
  schemaId,
}: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const { data, isLoading, isError } = useListDatabasesQuery();

  usePrefetch({ databaseId, schemaId });

  const { expanded, toggle } = useExpandedState(databaseId);

  if (isError) {
    throw new Error("Failed to load databases");
  }

  if (isLoading) {
    return renderLoading();
  }

  return data?.data?.map((database) => (
    <DatabaseNode
      key={database.id}
      database={database}
      expanded={expanded[database.id]}
      onToggle={() => toggle(database.id)}
      initialSchema={database.id === databaseId ? schemaId : undefined}
    />
  ));
}

function DatabaseNode({
  database,
  expanded,
  onToggle,
  initialSchema,
}: {
  database: Database;
  expanded?: boolean;
  onToggle: () => void;
  initialSchema?: SchemaId;
}) {
  const { data, isLoading, isError } = useListDatabaseSchemasQuery(
    expanded
      ? {
          id: database.id,
        }
      : skipToken,
  );

  const { expanded: expandedSchemas, toggle } = useExpandedState(initialSchema);

  if (isError) {
    throw new Error("Failed to load databases");
  }

  const singleSchema = !isLoading && data?.length === 1;

  const schemas = data?.map((name) => {
    const slug = `${database.id}:${name}`;
    return (
      <SchemaNode
        key={name}
        databaseId={database.id}
        schemaId={name}
        expanded={singleSchema || expandedSchemas[slug]}
        onToggle={() => toggle(slug)}
        flatten={singleSchema}
      />
    );
  });

  return (
    <Node
      type="database"
      name={database.name}
      expanded={expanded}
      onToggle={onToggle}
      href={getUrl({
        databaseId: database.id,
        schemaId: undefined,
        tableId: undefined,
        fieldId: undefined,
      })}
    >
      {isLoading ? renderLoading() : schemas}
    </Node>
  );
}

function SchemaNode({
  databaseId,
  schemaId,
  expanded,
  onToggle,
  flatten,
}: {
  databaseId: DatabaseId;
  schemaId: SchemaId;
  expanded?: boolean;
  onToggle: () => void;
  flatten?: boolean;
}) {
  const { data, isLoading, isError } = useListDatabaseSchemaTablesQuery(
    expanded
      ? {
          id: databaseId,
          schema: schemaId,
        }
      : skipToken,
  );

  if (isError) {
    throw new Error("Failed to load databases");
  }

  const tables = data?.map((table) => (
    <TableNode
      key={table.id}
      name={table.display_name ?? table.name}
      databaseId={databaseId}
      schemaId={schemaId}
      tableId={table.id}
    />
  ));

  if (flatten) {
    return tables;
  }

  return (
    <Node
      type="schema"
      name={schemaId}
      expanded={expanded}
      onToggle={onToggle}
      href={getUrl({
        databaseId,
        schemaId,
        tableId: undefined,
        fieldId: undefined,
      })}
    >
      {isLoading ? renderLoading() : tables}
    </Node>
  );
}

function TableNode({
  name,
  databaseId,
  schemaId,
  tableId,
}: {
  name: string;
  databaseId: DatabaseId;
  schemaId: SchemaId;
  tableId: TableId;
}) {
  return (
    <Node
      type="table"
      name={name}
      href={getUrl({
        databaseId,
        schemaId,
        tableId,
        fieldId: undefined,
      })}
    />
  );
}
